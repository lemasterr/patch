-- Travel rewards are a reconciliation of current visit state, not an append
-- only award log.  Rows keep their identity and user overrides across revoke /
-- reactivate cycles.
create table public.travel_operations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
alter table public.travel_operations enable row level security;
revoke all on public.travel_operations from public, anon, authenticated;

create or replace function private.reconcile_world_patches(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_threshold integer;
  v_region text;
begin
  -- Country rows are active only for visited/lived countries that are part of
  -- the bounded catalog. Wishlist entries deliberately never earn a Patch.
  insert into public.achievements (
    owner_id, title, description, category, achievement_date, visibility,
    rarity, status, lifecycle_status, source_kind, source_key, idempotency_key,
    cover_key, image_provider, completed_at, revoked_at
  )
  select
    p_user_id, 'Visited ' || v.country_name,
    'Added ' || v.country_name || ' to your Patch world.', 'travel',
    coalesce(v.visited_at, current_date), 'private', 'common', 'completed',
    'completed', 'country', 'country:' || v.country_code,
    md5(p_user_id::text || ':country:' || v.country_code)::uuid,
    'country-' || lower(v.country_code), 'local-pixel', now(), null
  from public.visited_countries v
  join public.country_catalog c on c.country_code = v.country_code
  where v.user_id = p_user_id and v.status in ('visited', 'lived')
  on conflict (owner_id, idempotency_key) do update set
    title = excluded.title,
    description = case when public.achievements.description_overridden then public.achievements.description else excluded.description end,
    achievement_date = case when public.achievements.date_overridden then public.achievements.achievement_date else excluded.achievement_date end,
    cover_key = excluded.cover_key,
    lifecycle_status = 'completed',
    revoked_at = null,
    completed_at = coalesce(public.achievements.completed_at, now());

  select count(*)::integer into v_count
  from public.visited_countries v
  join public.country_catalog c on c.country_code = v.country_code
  where v.user_id = p_user_id and v.status in ('visited', 'lived') and c.counts_toward_milestones;

  for v_threshold in 5..195 by 5 loop
    exit when v_threshold > v_count;
    insert into public.achievements (
      owner_id, title, description, category, achievement_date, visibility,
      rarity, status, lifecycle_status, source_kind, source_key, idempotency_key,
      cover_key, image_provider, completed_at, revoked_at
    ) values (
      p_user_id, 'Explored ' || v_threshold || ' countries',
      'Your Patch world now includes ' || v_threshold || ' countries.', 'travel', current_date,
      'private', case when v_threshold >= 100 then 'legendary' when v_threshold >= 50 then 'rare' else 'common' end,
      'completed', 'completed', 'country_milestone', 'country_milestone:' || v_threshold,
      md5(p_user_id::text || ':country-milestone:' || v_threshold)::uuid,
      'country-milestone-' || v_threshold, 'local-pixel', now(), null
    ) on conflict (owner_id, idempotency_key) do update set
      title = excluded.title,
      description = case when public.achievements.description_overridden then public.achievements.description else excluded.description end,
      achievement_date = case when public.achievements.date_overridden then public.achievements.achievement_date else excluded.achievement_date end,
      rarity = excluded.rarity, lifecycle_status = 'completed', revoked_at = null,
      completed_at = coalesce(public.achievements.completed_at, now());
  end loop;

  for v_region in select distinct region from public.country_catalog loop
    if not exists (
      select 1 from public.country_catalog c
      where c.region = v_region and c.counts_toward_milestones
        and not exists (
          select 1 from public.visited_countries v
          where v.user_id = p_user_id and v.country_code = c.country_code and v.status in ('visited', 'lived')
        )
    ) then
      insert into public.achievements (
        owner_id, title, description, category, achievement_date, visibility,
        rarity, status, lifecycle_status, source_kind, source_key, idempotency_key,
        cover_key, image_provider, completed_at, revoked_at
      ) values (
        p_user_id, 'Completed ' || initcap(v_region),
        'You explored every country in ' || initcap(v_region) || '.', 'travel', current_date,
        'private', 'legendary', 'completed', 'completed', 'continent', 'continent:' || v_region,
        md5(p_user_id::text || ':continent:' || v_region)::uuid,
        'continent-' || v_region, 'local-pixel', now(), null
      ) on conflict (owner_id, idempotency_key) do update set
        lifecycle_status = 'completed', revoked_at = null,
        completed_at = coalesce(public.achievements.completed_at, now());
    end if;
  end loop;

  -- Everything system-generated which is no longer earned is retained as a
  -- locked history row for the travel UI, but removed from active collections
  -- and profile totals.
  update public.achievements a
  set revoked_at = coalesce(a.revoked_at, now()), lifecycle_status = 'locked'
  where a.owner_id = p_user_id
    and a.source_kind in ('country', 'country_milestone', 'continent')
    and (
      (a.source_kind = 'country' and not exists (
        select 1 from public.visited_countries v where v.user_id = p_user_id and v.status in ('visited', 'lived') and a.source_key = 'country:' || v.country_code
      ))
      or (a.source_kind = 'country_milestone' and (split_part(a.source_key, ':', 2))::integer > v_count)
      or (a.source_kind = 'continent' and exists (
        select 1 from public.country_catalog c
        where c.region = split_part(a.source_key, ':', 2) and c.counts_toward_milestones
          and not exists (select 1 from public.visited_countries v where v.user_id = p_user_id and v.country_code = c.country_code and v.status in ('visited', 'lived'))
      ))
    );
end;
$$;

create or replace function private.sync_country_achievements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reconcile_world_patches(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$;

-- Reconcile legacy system rows once after source backfill.
do $$
declare r record;
begin
  for r in select distinct user_id from public.visited_countries loop
    perform private.reconcile_world_patches(r.user_id);
  end loop;
end;
$$;

create or replace function public.set_country_visit_v2(
  p_country_code text,
  p_country_name text,
  p_status public.country_visit_status,
  p_visit_month integer default null,
  p_visit_year integer default null,
  p_note text default null,
  p_operation_id uuid default null
)
returns table (active_patch_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_country_code, '')));
  v_name text := trim(coalesce(p_country_name, ''));
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  if v_code !~ '^[A-Z]{2}$' or char_length(v_name) not between 1 and 80 then raise exception 'invalid country' using errcode = 'check_violation'; end if;
  if (p_visit_month is null) <> (p_visit_year is null) then raise exception 'month and year must be provided together' using errcode = 'check_violation'; end if;
  if p_operation_id is null then raise exception 'an operation id is required' using errcode = '22023'; end if;
  insert into public.travel_operations (user_id, operation_id) values (v_user_id, p_operation_id) on conflict do nothing;
  if not found then
    return query select coalesce(array_agg(a.id), array[]::uuid[]) from public.achievements a where a.owner_id = v_user_id and a.revoked_at is null and a.source_kind <> 'user';
    return;
  end if;
  insert into public.visited_countries (user_id, country_code, country_name, status, visited_at, visit_month, visit_year, note)
  values (v_user_id, v_code, v_name, p_status, current_date, p_visit_month, p_visit_year, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (user_id, country_code) do update set country_name = excluded.country_name, status = excluded.status, visit_month = excluded.visit_month, visit_year = excluded.visit_year, note = excluded.note;
  perform private.reconcile_world_patches(v_user_id);
  return query select coalesce(array_agg(a.id), array[]::uuid[]) from public.achievements a where a.owner_id = v_user_id and a.revoked_at is null and a.source_kind <> 'user';
end;
$$;

create or replace function public.remove_country_visit_v2(p_country_code text, p_operation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_code text := upper(trim(coalesce(p_country_code, '')));
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  if v_code !~ '^[A-Z]{2}$' or p_operation_id is null then raise exception 'invalid removal operation' using errcode = '22023'; end if;
  insert into public.travel_operations (user_id, operation_id) values (v_user_id, p_operation_id) on conflict do nothing;
  if not found then return; end if;
  delete from public.visited_countries where user_id = v_user_id and country_code = v_code;
  perform private.reconcile_world_patches(v_user_id);
end;
$$;

revoke all on function public.set_country_visit_v2(text, text, public.country_visit_status, integer, integer, text, uuid), public.remove_country_visit_v2(text, uuid) from public, anon;
grant execute on function public.set_country_visit_v2(text, text, public.country_visit_status, integer, integer, text, uuid), public.remove_country_visit_v2(text, uuid) to authenticated;
revoke all on function private.reconcile_world_patches(uuid) from public, anon, authenticated;
