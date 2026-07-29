-- Travel achievements are system-generated, immutable rewards.  The catalog is
-- deliberately separate from @svg-maps/world: territories remain markable on the
-- map, while only the 195 UN countries/observers advance global milestones.

alter table public.user_settings
  add column if not exists map_default_focus text not null default 'world'
    check (map_default_focus in ('world', 'europe', 'asia', 'africa', 'americas', 'oceania'));

alter table public.profiles
  add column if not exists map_is_public boolean not null default false;

create table public.country_catalog (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  region text not null check (region in ('europe', 'asia', 'africa', 'americas', 'oceania')),
  counts_toward_milestones boolean not null default true
);

insert into public.country_catalog (country_code, region)
select country_code, region
from (
  select unnest(array[
    'AD','AL','AT','BA','BE','BG','BY','CH','CZ','DE','DK','EE','ES','FI','FR','GB',
    'GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL',
    'NO','PL','PT','RO','RS','RU','SE','SI','SK','SM','UA','VA'
  ]::text[]) as country_code, 'europe'::text as region
  union all
  select unnest(array[
    'AE','AF','AM','AZ','BH','BD','BN','BT','CN','CY','GE','ID','IN','IQ','IR','IL',
    'JP','JO','KG','KH','KP','KR','KW','KZ','LA','LB','LK','MM','MN','MV','MY','NP',
    'OM','PH','PK','PS','QA','SA','SG','SY','TH','TJ','TL','TM','TR','UZ','VN','YE'
  ]::text[]), 'asia'::text
  union all
  select unnest(array[
    'AO','BF','BI','BJ','BW','CD','CF','CG','CI','CM','CV','DJ','DZ','EG','ER','ET',
    'GA','GH','GM','GN','GQ','GW','KE','KM','LR','LS','LY','MA','MG','ML','MR','MU',
    'MW','MZ','NA','NE','NG','RW','SC','SD','SL','SN','SO','SS','ST','SZ','TD','TG',
    'TN','TZ','UG','ZA','ZM','ZW'
  ]::text[]), 'africa'::text
  union all
  select unnest(array[
    'AG','AR','BB','BO','BR','BS','BZ','CA','CL','CO','CR','CU','DM','DO','EC','GD',
    'GT','GY','HN','HT','JM','KN','LC','MX','NI','PA','PE','PY','SR','SV','TT','US',
    'UY','VC','VE'
  ]::text[]), 'americas'::text
  union all
  select unnest(array[
    'AU','FJ','FM','KI','MH','NR','NZ','PG','PW','SB','TO','TV','VU','WS'
  ]::text[]), 'oceania'::text
) as catalog
on conflict (country_code) do update
  set region = excluded.region,
      counts_toward_milestones = excluded.counts_toward_milestones;

alter table public.country_catalog enable row level security;

create policy "country_catalog_read_authenticated"
  on public.country_catalog for select to authenticated
  using (true);

grant select on public.country_catalog to authenticated;

-- Existing aggregate entries contain no user-authored content.  They are removed
-- once, so profile totals and collections no longer surface the obsolete reward.
delete from public.achievements a
where a.idempotency_key = md5(a.owner_id::text || ':country-count')::uuid;

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
  v_achievement_id uuid;
  v_threshold integer;
  v_region text;
  v_explored_count integer;
begin
  if tg_op <> 'DELETE' and new.status in ('visited', 'lived') then
    select id into v_achievement_id
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

    if v_achievement_id is null then
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

  select count(*)::integer into v_explored_count
  from public.visited_countries v
  join public.country_catalog c on c.country_code = v.country_code
  where v.user_id = v_user_id
    and v.status in ('visited', 'lived')
    and c.counts_toward_milestones;

  for v_threshold in 5..195 by 5 loop
    exit when v_threshold > v_explored_count;
    v_achievement_id := null;
    insert into public.achievements (
      owner_id, title, description, category, achievement_date, visibility,
      rarity, status, idempotency_key, cover_key, image_provider, completed_at
    ) values (
      v_user_id,
      'Explored ' || v_threshold || ' countries',
      'Your Patch world now includes ' || v_threshold || ' countries.',
      'travel',
      current_date,
      'private',
      (case when v_threshold >= 100 then 'legendary' when v_threshold >= 50 then 'rare' else 'common' end)::public.achievement_rarity,
      'completed',
      md5(v_user_id::text || ':country-milestone:' || v_threshold)::uuid,
      'country-milestone-' || v_threshold,
      'local-pixel',
      now()
    )
    on conflict (owner_id, idempotency_key) do nothing
    returning id into v_achievement_id;

    if v_achievement_id is not null then
      insert into public.notifications (
        owner_id, type, achievement_id, title, body, link, dedupe_key
      ) values (
        v_user_id,
        'achievement_completed',
        v_achievement_id,
        'Travel milestone unlocked',
        'You explored ' || v_threshold || ' countries.',
        '/achievements/' || v_achievement_id::text,
        'country-milestone:' || v_threshold
      ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end loop;

  for v_region in select distinct region from public.country_catalog loop
    if not exists (
      select 1
      from public.country_catalog c
      where c.region = v_region
        and c.counts_toward_milestones
        and not exists (
          select 1
          from public.visited_countries v
          where v.user_id = v_user_id
            and v.country_code = c.country_code
            and v.status in ('visited', 'lived')
        )
    ) then
      v_achievement_id := null;
      insert into public.achievements (
        owner_id, title, description, category, achievement_date, visibility,
        rarity, status, idempotency_key, cover_key, image_provider, completed_at
      ) values (
        v_user_id,
        'Completed ' || initcap(v_region),
        'You explored every country in ' || initcap(v_region) || '.',
        'travel',
        current_date,
        'private',
        'legendary',
        'completed',
        md5(v_user_id::text || ':continent:' || v_region)::uuid,
        'continent-' || v_region,
        'local-pixel',
        now()
      )
      on conflict (owner_id, idempotency_key) do nothing
      returning id into v_achievement_id;

      if v_achievement_id is not null then
        insert into public.notifications (
          owner_id, type, achievement_id, title, body, link, dedupe_key
        ) values (
          v_user_id,
          'achievement_completed',
          v_achievement_id,
          'Continent completed',
          initcap(v_region) || ' is complete on your Patch map.',
          '/achievements/' || v_achievement_id::text,
          'continent-completed:' || v_region
        ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end if;
  end loop;

  return coalesce(new, old);
end;
$$;

drop function if exists public.set_country_visit(
  text,
  text,
  public.country_visit_status,
  integer,
  integer,
  text
);

create function public.set_country_visit(
  p_country_code text,
  p_country_name text,
  p_status public.country_visit_status,
  p_visit_month integer default null,
  p_visit_year integer default null,
  p_note text default null
)
returns table (unlocked_achievement_ids uuid[])
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code text := upper(trim(p_country_code));
  v_name text := trim(p_country_name);
  v_started timestamptz := transaction_timestamp();
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

  return query
  select coalesce(
    array_agg(
      a.id
      order by
        case
          when a.cover_key like 'continent-%' then 1
          when a.cover_key like 'country-milestone-%' then 2
          else 3
        end,
        a.created_at desc
    ),
    array[]::uuid[]
  )
  from public.achievements a
  where a.owner_id = v_user_id
    and a.created_at >= v_started
    and (
      a.cover_key like 'country-%'
      or a.cover_key like 'country-milestone-%'
      or a.cover_key like 'continent-%'
    );
end;
$$;

revoke all on function public.set_country_visit(text, text, public.country_visit_status, integer, integer, text) from public, anon;
grant execute on function public.set_country_visit(text, text, public.country_visit_status, integer, integer, text) to authenticated;
revoke all on function private.sync_country_achievements() from public, anon, authenticated;

create function public.get_public_profile_map(p_profile_id uuid)
returns table (
  country_code text,
  country_name text,
  status public.country_visit_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.country_code, v.country_name, v.status
  from public.visited_countries v
  join public.profiles p on p.id = v.user_id
  where (select auth.uid()) is not null
    and v.user_id = p_profile_id
    and p.is_discoverable
    and p.map_is_public
    and v.status in ('visited', 'lived')
  order by v.updated_at desc;
$$;

revoke all on function public.get_public_profile_map(uuid) from public, anon;
grant execute on function public.get_public_profile_map(uuid) to authenticated;
