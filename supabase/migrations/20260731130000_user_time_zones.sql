-- Calendar dates belong to the person who created them, not to the database
-- session's timezone. This keeps a local "today" valid on either side of UTC.

alter table public.profiles
  add column if not exists time_zone text not null default 'UTC';

create or replace function private.is_valid_time_zone(p_time_zone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names zone
    where zone.name = p_time_zone
  );
$$;

create or replace function private.validate_profile_time_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.time_zone := trim(coalesce(new.time_zone, ''));
  if not private.is_valid_time_zone(new.time_zone) then
    raise exception 'invalid IANA time zone' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validate_time_zone on public.profiles;
create trigger profiles_validate_time_zone
before insert or update of time_zone on public.profiles
for each row execute function private.validate_profile_time_zone();

create or replace function private.user_local_today(p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    statement_timestamp() at time zone coalesce((
      select profile.time_zone
      from public.profiles profile
      where profile.id = p_user_id
    ), 'UTC')
  )::date;
$$;

alter table public.visited_countries
  drop constraint if exists visited_countries_visited_at_check;

create or replace function private.validate_travel_visit_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visited_at > private.user_local_today(new.user_id) then
    raise exception 'travel visit date cannot be in the future'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists visited_countries_validate_visit_date on public.visited_countries;
create trigger visited_countries_validate_visit_date
before insert or update of user_id, visited_at on public.visited_countries
for each row execute function private.validate_travel_visit_date();

create or replace function public.set_user_time_zone(p_time_zone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text := trim(coalesce(p_time_zone, ''));
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not private.is_valid_time_zone(v_time_zone) then
    raise exception 'invalid IANA time zone' using errcode = '22023';
  end if;

  update public.profiles
  set time_zone = v_time_zone
  where id = v_user_id;
  return v_time_zone;
end;
$$;

drop function if exists public.get_current_profile_summary();
create function public.get_current_profile_summary()
returns table (
  id uuid,
  username extensions.citext,
  display_name text,
  bio text,
  avatar_key text,
  onboarding_completed boolean,
  achievement_count integer,
  total_received_likes integer,
  friend_count integer,
  is_discoverable boolean,
  map_is_public boolean,
  owner_achievement_count integer,
  owner_total_received_likes integer,
  time_zone text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.bio,
    profile.avatar_key,
    profile.onboarding_completed,
    profile.achievement_count,
    profile.total_received_likes,
    profile.friend_count,
    profile.is_discoverable,
    profile.map_is_public,
    profile.owner_achievement_count,
    profile.owner_total_received_likes,
    profile.time_zone
  from public.profiles profile
  where profile.id = auth.uid();
end;
$$;

create or replace function public.create_patch_v2(
  p_title text,
  p_description text,
  p_category public.achievement_category,
  p_rarity public.achievement_rarity,
  p_visibility public.achievement_visibility,
  p_lifecycle_status public.patch_lifecycle_status,
  p_event_date date,
  p_target_date date,
  p_operation_id uuid
)
returns table (
  achievement_id uuid,
  job_id uuid,
  lifecycle_status public.patch_lifecycle_status,
  generation_status public.achievement_status,
  was_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_patch public.achievements%rowtype;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null
    or char_length(trim(coalesce(p_title, ''))) not between 2 and 80
    or char_length(trim(coalesce(p_description, ''))) not between 2 and 600
    or p_event_date is null
    or p_event_date > private.user_local_today(v_user_id) then
    raise exception 'Patch fields are invalid' using errcode = 'check_violation';
  end if;
  if p_lifecycle_status = 'locked' and p_target_date is not null and p_target_date < p_event_date then
    raise exception 'target date cannot precede the Patch date' using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
  );
  select * into v_patch
  from public.achievements patch
  where patch.owner_id = v_user_id and patch.idempotency_key = p_operation_id;
  if found then
    select job.id into v_job_id
    from public.achievement_generation_jobs job
    where job.achievement_id = v_patch.id
    order by job.created_at desc
    limit 1;
    return query select v_patch.id, v_job_id, v_patch.lifecycle_status, v_patch.status, true;
    return;
  end if;

  insert into public.achievements (
    owner_id, title, description, category, achievement_date, target_date,
    visibility, rarity, lifecycle_status, source_kind, status, idempotency_key
  ) values (
    v_user_id, trim(p_title), trim(p_description), p_category, p_event_date,
    case when p_lifecycle_status = 'locked' then p_target_date else null end,
    p_visibility, p_rarity, p_lifecycle_status, 'user',
    case when p_lifecycle_status = 'completed' then 'processing'::public.achievement_status else 'draft'::public.achievement_status end,
    p_operation_id
  ) returning * into v_patch;

  insert into public.achievement_events (
    achievement_id, owner_id, operation_id, kind, event_date, title, note
  ) values (
    v_patch.id, v_user_id, p_operation_id, 'created', p_event_date,
    v_patch.title, v_patch.description
  );
  v_job_id := private.create_generation_job_if_needed(v_patch);
  select * into v_patch from public.achievements patch where patch.id = v_patch.id;
  return query select v_patch.id, v_job_id, v_patch.lifecycle_status, v_patch.status, false;
end;
$$;

create or replace function public.set_patch_lifecycle(
  p_patch_id uuid,
  p_status public.patch_lifecycle_status,
  p_event_date date,
  p_note text,
  p_operation_id uuid,
  p_confirm_generation_revert boolean default false
)
returns table (
  achievement_id uuid,
  job_id uuid,
  lifecycle_status public.patch_lifecycle_status,
  generation_status public.achievement_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_patch public.achievements%rowtype;
  v_job_id uuid;
  v_kind public.achievement_event_kind;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;
  if p_event_date is null or p_event_date > private.user_local_today(v_user_id) then
    raise exception 'event date cannot be in the future' using errcode = 'check_violation';
  end if;

  select * into v_patch from private.assert_patch_owner(p_patch_id);
  if exists (
    select 1
    from public.achievement_events event
    where event.owner_id = v_patch.owner_id and event.operation_id = p_operation_id
  ) then
    select job.id into v_job_id
    from public.achievement_generation_jobs job
    where job.achievement_id = v_patch.id
    order by job.created_at desc
    limit 1;
    return query select v_patch.id, v_job_id, v_patch.lifecycle_status, v_patch.status;
    return;
  end if;
  if v_patch.lifecycle_status = p_status then
    return query select v_patch.id, null::uuid, v_patch.lifecycle_status, v_patch.status;
    return;
  end if;
  if v_patch.lifecycle_status = 'completed' and p_status <> 'completed' then
    if not p_confirm_generation_revert then
      raise exception 'confirm reverting a completed Patch before changing its lifecycle' using errcode = 'check_violation';
    end if;
    if v_patch.cover_key is not null or v_patch.cover_url is not null then
      raise exception 'a generated Patch cannot return to a goal' using errcode = 'check_violation';
    end if;
    if exists (
      select 1
      from public.achievement_generation_jobs job
      where job.achievement_id = v_patch.id and job.status = 'running'
    ) then
      raise exception 'generation is already running; try again when it settles' using errcode = '55000';
    end if;
    update public.achievement_generation_jobs job
    set status = 'failed', finished_at = now(),
      error_message = 'Lifecycle changed before generation completed.'
    where job.achievement_id = v_patch.id and job.status = 'queued';
    update public.achievements
    set status = 'failed', failure_reason = 'Generation cancelled because the Patch returned to a goal.'
    where id = v_patch.id and status in ('processing', 'draft');
  end if;

  update public.achievements
  set lifecycle_status = p_status,
      target_date = case when p_status = 'locked' then p_event_date else target_date end
  where id = v_patch.id
  returning * into v_patch;
  v_kind := case
    when p_status = 'completed' then 'completed'::public.achievement_event_kind
    when p_status = 'in_progress' then 'progress'::public.achievement_event_kind
    else 'note'::public.achievement_event_kind
  end;
  insert into public.achievement_events (
    achievement_id, owner_id, operation_id, kind, event_date, note
  ) values (
    v_patch.id, v_patch.owner_id, p_operation_id, v_kind, p_event_date,
    nullif(trim(coalesce(p_note, '')), '')
  );
  v_job_id := private.create_generation_job_if_needed(v_patch);
  select * into v_patch from public.achievements patch where patch.id = v_patch.id;
  return query select v_patch.id, v_job_id, v_patch.lifecycle_status, v_patch.status;
end;
$$;

create or replace function public.add_patch_event(
  p_patch_id uuid,
  p_kind public.achievement_event_kind,
  p_event_date date,
  p_title text,
  p_note text,
  p_value numeric,
  p_unit text,
  p_operation_id uuid
)
returns public.achievement_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_patch public.achievements%rowtype;
  v_event public.achievement_events%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_kind = 'created' then
    raise exception 'created events are managed by Patch creation' using errcode = 'check_violation';
  end if;
  if p_operation_id is null or p_event_date is null or p_event_date > private.user_local_today(v_user_id) then
    raise exception 'event date cannot be in the future' using errcode = 'check_violation';
  end if;
  select * into v_patch from private.assert_patch_owner(p_patch_id);
  select * into v_event
  from public.achievement_events event
  where event.owner_id = v_patch.owner_id and event.operation_id = p_operation_id;
  if found then
    return v_event;
  end if;
  insert into public.achievement_events (
    achievement_id, owner_id, operation_id, kind, event_date, title, note, value, unit
  ) values (
    v_patch.id, v_patch.owner_id, p_operation_id, p_kind, p_event_date,
    p_title, p_note, p_value, p_unit
  ) returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.update_patch_event(
  p_event_id uuid,
  p_event_date date,
  p_title text,
  p_note text,
  p_value numeric,
  p_unit text,
  p_operation_id uuid
)
returns public.achievement_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.achievement_events%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null
    or p_event_date is null
    or p_event_date > private.user_local_today(v_user_id) then
    raise exception 'a valid operation and event date are required' using errcode = 'check_violation';
  end if;
  select * into v_event
  from public.achievement_events event
  where event.id = p_event_id and event.owner_id = v_user_id
  for update;
  if not found then
    raise exception 'Patch update not found' using errcode = 'no_data_found';
  end if;
  if v_event.kind = 'created' then
    raise exception 'the original creation event cannot be edited' using errcode = 'check_violation';
  end if;
  update public.achievement_events
  set event_date = p_event_date,
      title = p_title,
      note = p_note,
      value = p_value,
      unit = p_unit
  where id = v_event.id
  returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.update_user_patch(
  p_patch_id uuid,
  p_title text,
  p_description text,
  p_category public.achievement_category,
  p_rarity public.achievement_rarity,
  p_visibility public.achievement_visibility,
  p_event_date date,
  p_target_date date,
  p_operation_id uuid
)
returns public.achievements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_patch public.achievements%rowtype;
begin
  if v_user_id is null
    or p_operation_id is null
    or char_length(trim(coalesce(p_title, ''))) not between 2 and 80
    or char_length(trim(coalesce(p_description, ''))) not between 2 and 600
    or p_event_date is null
    or p_event_date > private.user_local_today(v_user_id) then
    raise exception 'Patch fields are invalid' using errcode = 'check_violation';
  end if;
  select * into v_patch from private.assert_patch_owner(p_patch_id);
  update public.achievements
  set title = trim(p_title),
      description = trim(p_description),
      category = p_category,
      rarity = p_rarity,
      visibility = p_visibility,
      achievement_date = p_event_date,
      target_date = case when lifecycle_status = 'locked' then p_target_date else target_date end
  where id = v_patch.id
  returning * into v_patch;
  return v_patch;
end;
$$;

create or replace function public.update_system_travel_patch(
  p_patch_id uuid,
  p_description text,
  p_date date,
  p_operation_id uuid
)
returns public.achievements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_patch public.achievements%rowtype;
begin
  if v_user_id is null or p_operation_id is null then
    raise exception 'authentication and an operation id are required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 2 and 600
    or p_date is null
    or p_date > private.user_local_today(v_user_id) then
    raise exception 'travel Patch fields are invalid' using errcode = 'check_violation';
  end if;
  select * into v_patch from private.assert_patch_owner(p_patch_id, true);
  if v_patch.source_kind = 'user' then
    raise exception 'this is not a system travel Patch' using errcode = 'check_violation';
  end if;
  update public.achievements
  set description = trim(p_description),
      achievement_date = p_date,
      description_overridden = true,
      date_overridden = true
  where id = v_patch.id
  returning * into v_patch;
  return v_patch;
end;
$$;

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
  v_today date := private.user_local_today(p_user_id);
begin
  insert into public.achievements (owner_id, title, description, category, achievement_date, visibility, rarity, status, lifecycle_status, source_kind, source_key, idempotency_key, cover_key, image_provider, completed_at, revoked_at)
  select p_user_id, 'Visited ' || visit.country_name, 'Added ' || visit.country_name || ' to your Patch world.', 'travel', coalesce(visit.visited_at, v_today), 'private', 'common', 'completed', 'completed', 'country', 'country:' || visit.country_code, md5(p_user_id::text || ':country:' || visit.country_code)::uuid, 'country-' || lower(visit.country_code), 'local-pixel', now(), null
  from public.visited_countries visit
  join public.country_catalog catalog on catalog.country_code = visit.country_code
  where visit.user_id = p_user_id and visit.status in ('visited', 'lived')
  on conflict (owner_id, idempotency_key) do update set
    title = excluded.title,
    description = case when public.achievements.description_overridden then public.achievements.description else excluded.description end,
    achievement_date = case when public.achievements.date_overridden then public.achievements.achievement_date else excluded.achievement_date end,
    cover_key = excluded.cover_key,
    lifecycle_status = 'completed',
    revoked_at = null,
    completed_at = coalesce(public.achievements.completed_at, now());

  select count(*)::integer into v_count
  from public.visited_countries visit
  join public.country_catalog catalog on catalog.country_code = visit.country_code
  where visit.user_id = p_user_id
    and visit.status in ('visited', 'lived')
    and catalog.counts_toward_milestones;
  for v_threshold in 5..195 by 5 loop
    exit when v_threshold > v_count;
    insert into public.achievements (owner_id, title, description, category, achievement_date, visibility, rarity, status, lifecycle_status, source_kind, source_key, idempotency_key, cover_key, image_provider, completed_at, revoked_at)
    values (p_user_id, 'Explored ' || v_threshold || ' countries', 'Your Patch world now includes ' || v_threshold || ' countries.', 'travel', v_today, 'private', (case when v_threshold >= 100 then 'legendary' when v_threshold >= 50 then 'rare' else 'common' end)::public.achievement_rarity, 'completed', 'completed', 'country_milestone', 'country_milestone:' || v_threshold, md5(p_user_id::text || ':country-milestone:' || v_threshold)::uuid, 'country-milestone-' || v_threshold, 'local-pixel', now(), null)
    on conflict (owner_id, idempotency_key) do update set
      title = excluded.title,
      description = case when public.achievements.description_overridden then public.achievements.description else excluded.description end,
      achievement_date = case when public.achievements.date_overridden then public.achievements.achievement_date else excluded.achievement_date end,
      rarity = excluded.rarity,
      lifecycle_status = 'completed',
      revoked_at = null,
      completed_at = coalesce(public.achievements.completed_at, now());
  end loop;

  for v_region in select distinct region from public.country_catalog loop
    if not exists (
      select 1
      from public.country_catalog catalog
      where catalog.region = v_region
        and catalog.counts_toward_milestones
        and not exists (
          select 1
          from public.visited_countries visit
          where visit.user_id = p_user_id
            and visit.country_code = catalog.country_code
            and visit.status in ('visited', 'lived')
        )
    ) then
      insert into public.achievements (owner_id, title, description, category, achievement_date, visibility, rarity, status, lifecycle_status, source_kind, source_key, idempotency_key, cover_key, image_provider, completed_at, revoked_at)
      values (p_user_id, 'Completed ' || initcap(v_region), 'You explored every country in ' || initcap(v_region) || '.', 'travel', v_today, 'private', 'legendary', 'completed', 'completed', 'continent', 'continent:' || v_region, md5(p_user_id::text || ':continent:' || v_region)::uuid, 'continent-' || v_region, 'local-pixel', now(), null)
      on conflict (owner_id, idempotency_key) do update set
        lifecycle_status = 'completed',
        revoked_at = null,
        completed_at = coalesce(public.achievements.completed_at, now());
    end if;
  end loop;

  update public.achievements patch
  set revoked_at = coalesce(patch.revoked_at, now()),
      lifecycle_status = 'locked'
  where patch.owner_id = p_user_id
    and patch.source_kind in ('country', 'country_milestone', 'continent')
    and (
      (patch.source_kind = 'country' and not exists (
        select 1
        from public.visited_countries visit
        where visit.user_id = p_user_id
          and visit.status in ('visited', 'lived')
          and patch.source_key = 'country:' || visit.country_code
      ))
      or (patch.source_kind = 'country_milestone' and split_part(patch.source_key, ':', 2)::integer > v_count)
      or (patch.source_kind = 'continent' and exists (
        select 1
        from public.country_catalog catalog
        where catalog.region = split_part(patch.source_key, ':', 2)
          and catalog.counts_toward_milestones
          and not exists (
            select 1
            from public.visited_countries visit
            where visit.user_id = p_user_id
              and visit.country_code = catalog.country_code
              and visit.status in ('visited', 'lived')
          )
      ))
    );
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
  v_active_before uuid[] := array[]::uuid[];
  v_today date;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_code !~ '^[A-Z]{2}$'
    or not exists (select 1 from public.country_catalog where country_code = v_code)
    or char_length(v_name) not between 1 and 80 then
    raise exception 'invalid country' using errcode = 'check_violation';
  end if;
  if (p_visit_month is null) <> (p_visit_year is null) then
    raise exception 'month and year must be provided together' using errcode = 'check_violation';
  end if;
  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;

  insert into public.travel_operations (user_id, operation_id)
  values (v_user_id, p_operation_id)
  on conflict do nothing;
  if not found then
    return query select array[]::uuid[];
    return;
  end if;

  v_today := private.user_local_today(v_user_id);
  select coalesce(array_agg(patch.id), array[]::uuid[])
  into v_active_before
  from public.achievements patch
  where patch.owner_id = v_user_id
    and patch.revoked_at is null
    and patch.source_kind <> 'user';

  insert into public.visited_countries (
    user_id, country_code, country_name, status, visited_at,
    visit_month, visit_year, note
  ) values (
    v_user_id, v_code, v_name, p_status, v_today,
    p_visit_month, p_visit_year, nullif(trim(coalesce(p_note, '')), '')
  )
  on conflict (user_id, country_code) do update
  set country_name = excluded.country_name,
      status = excluded.status,
      visit_month = excluded.visit_month,
      visit_year = excluded.visit_year,
      note = excluded.note;

  perform private.reconcile_world_patches(v_user_id);
  return query
  select coalesce(array_agg(patch.id), array[]::uuid[])
  from public.achievements patch
  where patch.owner_id = v_user_id
    and patch.revoked_at is null
    and patch.source_kind <> 'user'
    and not (patch.id = any(v_active_before));
end;
$$;

revoke all on function private.is_valid_time_zone(text),
  private.validate_profile_time_zone(),
  private.user_local_today(uuid),
  private.validate_travel_visit_date(),
  private.reconcile_world_patches(uuid)
from public, anon, authenticated;
revoke all on function public.get_current_profile_summary() from public, anon;
grant execute on function public.get_current_profile_summary() to authenticated;
revoke all on function public.set_user_time_zone(text) from public, anon;
grant execute on function public.set_user_time_zone(text) to authenticated;
