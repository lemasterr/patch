alter table public.visited_countries
  add column country_name text,
  add column visit_month smallint,
  add column visit_year smallint,
  add column note text,
  add column updated_at timestamptz not null default now();

update public.visited_countries
set country_name = country_code
where country_name is null;

alter table public.visited_countries
  alter column country_name set not null,
  add constraint visited_countries_name_length
    check (char_length(country_name) between 1 and 80),
  add constraint visited_countries_month_range
    check (visit_month is null or visit_month between 1 and 12),
  add constraint visited_countries_year_range
    check (visit_year is null or visit_year between 1900 and 2100),
  add constraint visited_countries_month_year_pair
    check ((visit_month is null) = (visit_year is null)),
  add constraint visited_countries_note_length
    check (note is null or char_length(note) <= 280);

create trigger visited_countries_set_updated_at
before update on public.visited_countries
for each row execute function private.set_updated_at();

create or replace function private.sync_country_achievements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
  v_country_code text := coalesce(new.country_code, old.country_code);
  v_country_name text := coalesce(new.country_name, old.country_name, v_country_code);
  v_country_key uuid := md5(v_user_id::text || ':country:' || v_country_code)::uuid;
  v_total_key uuid := md5(v_user_id::text || ':country-count')::uuid;
  v_count integer;
  v_rarity public.achievement_rarity;
  v_country_achievement_id uuid;
begin
  if tg_op <> 'DELETE' and new.status in ('visited', 'lived') then
    select id into v_country_achievement_id
    from public.achievements
    where owner_id = v_user_id and idempotency_key = v_country_key;

    insert into public.achievements (
      owner_id, title, description, category, achievement_date, visibility,
      rarity, status, idempotency_key, cover_key, image_provider, completed_at
    ) values (
      v_user_id,
      'Visited ' || v_country_name,
      'Added ' || v_country_name || ' to your Patch world.',
      'travel',
      coalesce(new.visited_at, current_date),
      'private',
      'uncommon',
      'completed',
      v_country_key,
      'country-' || lower(v_country_code),
      'local-pixel',
      now()
    )
    on conflict (owner_id, idempotency_key) do update
      set title = excluded.title,
          description = excluded.description,
          achievement_date = excluded.achievement_date,
          cover_key = excluded.cover_key;

    if v_country_achievement_id is null then
      insert into public.notifications (
        owner_id, type, achievement_id, title, body, link, dedupe_key
      )
      select
        v_user_id,
        'achievement_completed',
        a.id,
        'New country unlocked',
        v_country_name || ' is now part of your Patch world.',
        '/achievements/' || a.id::text,
        'country-unlocked:' || v_country_code
      from public.achievements a
      where a.owner_id = v_user_id and a.idempotency_key = v_country_key
      on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;

  select count(*)::integer into v_count
  from public.visited_countries
  where user_id = v_user_id and status in ('visited', 'lived');

  v_rarity := case
    when v_count >= 100 then 'legendary'
    when v_count >= 50 then 'epic'
    when v_count >= 20 then 'rare'
    when v_count >= 5 then 'uncommon'
    else 'common'
  end;

  if v_count > 0 or exists (
    select 1 from public.achievements
    where owner_id = v_user_id and idempotency_key = v_total_key
  ) then
    insert into public.achievements (
      owner_id, title, description, category, achievement_date, visibility,
      rarity, status, idempotency_key, cover_key, image_provider, completed_at
    ) values (
      v_user_id,
      'Explored ' || v_count || case when v_count = 1 then ' country' else ' countries' end,
      'Your Patch world currently includes ' || v_count || case when v_count = 1 then ' country.' else ' countries.' end,
      'travel',
      current_date,
      'private',
      v_rarity,
      'completed',
      v_total_key,
      'world-count-' || greatest(v_count, 1)::text,
      'local-pixel',
      now()
    )
    on conflict (owner_id, idempotency_key) do update
      set title = excluded.title,
          description = excluded.description,
          achievement_date = excluded.achievement_date,
          rarity = excluded.rarity,
          cover_key = excluded.cover_key;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger visited_countries_sync_achievements
after insert or delete or update of status, country_name, visited_at
on public.visited_countries
for each row execute function private.sync_country_achievements();

create or replace function public.set_country_visit(
  p_country_code text,
  p_country_name text,
  p_status public.country_visit_status,
  p_visit_month smallint default null,
  p_visit_year smallint default null,
  p_note text default null
)
returns table (country_achievement_id uuid, aggregate_achievement_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code text := upper(trim(p_country_code));
  v_name text := trim(p_country_name);
  v_country_achievement_id uuid;
  v_aggregate_achievement_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid country code' using errcode = 'check_violation';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'invalid country name' using errcode = 'check_violation';
  end if;
  if (p_visit_month is null) <> (p_visit_year is null) then
    raise exception 'month and year must be provided together' using errcode = 'check_violation';
  end if;

  insert into public.visited_countries (
    user_id, country_code, country_name, status, visited_at,
    visit_month, visit_year, note
  ) values (
    v_user_id, v_code, v_name, p_status, current_date,
    p_visit_month, p_visit_year, nullif(trim(coalesce(p_note, '')), '')
  )
  on conflict (user_id, country_code) do update
    set country_name = excluded.country_name,
        status = excluded.status,
        visit_month = excluded.visit_month,
        visit_year = excluded.visit_year,
        note = excluded.note;

  if p_status in ('visited', 'lived') then
    select a.id into v_country_achievement_id
    from public.achievements a
    where a.owner_id = v_user_id
      and a.idempotency_key = md5(v_user_id::text || ':country:' || v_code)::uuid;
  end if;
  select a.id into v_aggregate_achievement_id
  from public.achievements a
  where a.owner_id = v_user_id
    and a.idempotency_key = md5(v_user_id::text || ':country-count')::uuid;

  return query select v_country_achievement_id, v_aggregate_achievement_id;
end;
$$;

create or replace function public.create_mobile_achievement(
  p_title text,
  p_description text,
  p_category public.achievement_category,
  p_achievement_date date,
  p_visibility public.achievement_visibility,
  p_rarity public.achievement_rarity,
  p_location_text text,
  p_location_latitude double precision,
  p_location_longitude double precision,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_achievement_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(p_title)) not between 2 and 80 then
    raise exception 'title must contain 2 to 80 characters' using errcode = 'check_violation';
  end if;
  if char_length(trim(p_description)) not between 2 and 600 then
    raise exception 'description must contain 2 to 600 characters' using errcode = 'check_violation';
  end if;
  if p_achievement_date > current_date then
    raise exception 'achievement date cannot be in the future' using errcode = 'check_violation';
  end if;
  if (p_location_latitude is null) <> (p_location_longitude is null) then
    raise exception 'coordinates must be provided together' using errcode = 'check_violation';
  end if;
  if p_location_latitude is not null and
    (p_location_latitude not between -90 and 90 or p_location_longitude not between -180 and 180)
  then
    raise exception 'coordinates are outside valid bounds' using errcode = 'check_violation';
  end if;

  select id into v_achievement_id
  from public.achievements
  where owner_id = v_user_id and idempotency_key = p_idempotency_key;
  if v_achievement_id is not null then
    return v_achievement_id;
  end if;

  insert into public.achievements (
    owner_id, title, description, category, achievement_date, visibility,
    rarity, location_text, location_latitude, location_longitude, status,
    idempotency_key, cover_key, image_provider, completed_at
  ) values (
    v_user_id, trim(p_title), trim(p_description), p_category,
    p_achievement_date, p_visibility, p_rarity,
    nullif(trim(coalesce(p_location_text, '')), ''),
    p_location_latitude, p_location_longitude, 'completed',
    p_idempotency_key,
    p_category::text || '-' || p_rarity::text || '-' || substr(md5(p_idempotency_key::text), 1, 2),
    'local-pixel', now()
  ) returning id into v_achievement_id;

  insert into public.notifications (
    owner_id, type, achievement_id, title, body, link, dedupe_key
  ) values (
    v_user_id,
    'achievement_completed',
    v_achievement_id,
    'Achievement unlocked',
    trim(p_title) || ' is ready to reveal.',
    '/achievements/' || v_achievement_id::text,
    'achievement-completed:' || v_achievement_id::text
  ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;

  return v_achievement_id;
end;
$$;

revoke all on function public.set_country_visit(text, text, public.country_visit_status, smallint, smallint, text) from public, anon;
revoke all on function public.create_mobile_achievement(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, double precision, double precision, uuid) from public, anon;
grant execute on function public.set_country_visit(text, text, public.country_visit_status, smallint, smallint, text) to authenticated;
grant execute on function public.create_mobile_achievement(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, double precision, double precision, uuid) to authenticated;

revoke all on function private.sync_country_achievements() from public, anon, authenticated;
