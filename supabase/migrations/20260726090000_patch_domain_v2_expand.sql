-- Patch domain v2 is deliberately additive. Legacy generation columns and
-- RPCs remain in place until every client and worker uses the v2 contract.

create type public.patch_lifecycle_status as enum (
  'locked',
  'in_progress',
  'completed'
);

create type public.achievement_source_kind as enum (
  'user',
  'country',
  'country_milestone',
  'continent'
);

create type public.moderation_status as enum (
  'active',
  'under_review',
  'hidden',
  'removed'
);

create type public.achievement_event_kind as enum (
  'created',
  'progress',
  'completed',
  'note'
);

alter table public.achievements
  add column if not exists lifecycle_status public.patch_lifecycle_status not null default 'completed',
  add column if not exists target_date date,
  add column if not exists hidden_at timestamptz,
  add column if not exists source_kind public.achievement_source_kind not null default 'user',
  add column if not exists source_key text,
  add column if not exists revoked_at timestamptz,
  add column if not exists description_overridden boolean not null default false,
  add column if not exists date_overridden boolean not null default false,
  add column if not exists moderation_status public.moderation_status not null default 'active';

-- User Patch location data is no longer part of the product. Physical column
-- removal is intentionally deferred to the contract migration.
update public.achievements
set
  location_text = null,
  location_latitude = null,
  location_longitude = null
where location_text is not null
   or location_latitude is not null
   or location_longitude is not null;

-- Existing artwork represents completed content. Identify legacy travel rows
-- by their stable generated cover key so future reconciliation can reuse them.
update public.achievements
set
  source_kind = case
    when cover_key ~ '^country-[A-Za-z]{2}$' then 'country'::public.achievement_source_kind
    when cover_key ~ '^country-milestone-[0-9]+$' then 'country_milestone'::public.achievement_source_kind
    when cover_key ~ '^continent-[A-Za-z_-]+$' then 'continent'::public.achievement_source_kind
    else 'user'::public.achievement_source_kind
  end,
  source_key = case
    when cover_key ~ '^country-[A-Za-z]{2}$' then 'country:' || upper(substring(cover_key from 9))
    when cover_key ~ '^country-milestone-[0-9]+$' then 'country_milestone:' || substring(cover_key from 19)
    when cover_key ~ '^continent-[A-Za-z_-]+$' then 'continent:' || lower(substring(cover_key from 11))
    else null
  end,
  lifecycle_status = 'completed'
where source_key is null;

alter table public.achievements
  add constraint achievements_source_shape_check
  check (
    (source_kind = 'user' and source_key is null)
    or (source_kind <> 'user' and source_key is not null and char_length(trim(source_key)) between 3 and 120)
  ) not valid,
  add constraint achievements_target_date_check
  check (target_date is null or target_date >= date '1900-01-01') not valid;

alter table public.achievements
  validate constraint achievements_source_shape_check;
alter table public.achievements
  validate constraint achievements_target_date_check;

create unique index if not exists achievements_system_source_key_idx
  on public.achievements (owner_id, source_kind, source_key)
  where source_kind <> 'user';

create index if not exists achievements_owner_lifecycle_idx
  on public.achievements (owner_id, lifecycle_status, created_at desc);

create index if not exists achievements_public_v2_idx
  on public.achievements (created_at desc, id desc)
  where visibility = 'public'
    and lifecycle_status = 'completed'
    and hidden_at is null
    and revoked_at is null
    and moderation_status = 'active';

create table public.achievement_events (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  kind public.achievement_event_kind not null,
  event_date date not null,
  title text,
  note text,
  value numeric,
  unit text,
  moderation_status public.moderation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, operation_id),
  constraint achievement_events_value_unit_check check (
    (value is null and unit is null)
    or (value is not null and char_length(trim(unit)) between 1 and 32)
  ),
  constraint achievement_events_title_check check (
    title is null or char_length(trim(title)) between 1 and 100
  ),
  constraint achievement_events_note_check check (
    note is null or char_length(trim(note)) between 1 and 1_200
  )
);

create index achievement_events_achievement_date_idx
  on public.achievement_events (achievement_id, event_date desc, created_at desc);

create or replace function private.validate_achievement_event_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.achievements a
    where a.id = new.achievement_id
      and a.owner_id = new.owner_id
  ) then
    raise exception 'event owner must own its Patch' using errcode = '42501';
  end if;
  new.title = nullif(trim(coalesce(new.title, '')), '');
  new.note = nullif(trim(coalesce(new.note, '')), '');
  new.unit = nullif(trim(coalesce(new.unit, '')), '');
  return new;
end;
$$;

create trigger achievement_events_validate_owner
before insert or update of achievement_id, owner_id, title, note, unit
on public.achievement_events
for each row execute function private.validate_achievement_event_owner();

create trigger achievement_events_set_updated_at
before update on public.achievement_events
for each row execute function private.set_updated_at();

alter table public.achievement_events enable row level security;

create policy "achievement_events_read_accessible"
on public.achievement_events for select to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.achievements a
    where a.id = achievement_id
      and a.visibility = 'public'
      and a.lifecycle_status = 'completed'
      and a.hidden_at is null
      and a.revoked_at is null
      and a.moderation_status = 'active'
      and moderation_status = 'active'
  )
);

revoke all on public.achievement_events from public, anon, authenticated;
grant select on public.achievement_events to authenticated;

create or replace function private.assert_patch_owner(
  p_patch_id uuid,
  p_allow_system boolean default false
)
returns public.achievements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patch public.achievements%rowtype;
begin
  select * into v_patch
  from public.achievements
  where id = p_patch_id
    and owner_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Patch not found' using errcode = 'no_data_found';
  end if;
  if not p_allow_system and v_patch.source_kind <> 'user' then
    raise exception 'System travel Patches have limited editing' using errcode = '42501';
  end if;
  return v_patch;
end;
$$;

create or replace function private.create_generation_job_if_needed(
  p_achievement public.achievements
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if p_achievement.lifecycle_status <> 'completed' then
    return null;
  end if;

  select j.id into v_job_id
  from public.achievement_generation_jobs j
  where j.achievement_id = p_achievement.id
    and j.status in ('queued', 'running', 'completed')
  order by j.created_at desc
  limit 1;

  if v_job_id is not null then
    return v_job_id;
  end if;

  update public.achievements
  set status = 'processing', failure_reason = null
  where id = p_achievement.id
    and status in ('draft', 'failed');

  insert into public.achievement_generation_jobs (
    achievement_id, owner_id, provider, available_at
  ) values (
    p_achievement.id, p_achievement.owner_id, 'patch-deterministic', now()
  ) returning id into v_job_id;

  return v_job_id;
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
  v_user_id uuid := (select auth.uid());
  v_achievement public.achievements%rowtype;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 80 then
    raise exception 'title must contain 2 to 80 characters' using errcode = 'check_violation';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 2 and 600 then
    raise exception 'description must contain 2 to 600 characters' using errcode = 'check_violation';
  end if;
  if p_event_date is null or p_event_date > current_date then
    raise exception 'event date cannot be in the future' using errcode = 'check_violation';
  end if;
  if p_lifecycle_status = 'locked' and p_target_date is not null and p_target_date < p_event_date then
    raise exception 'target date cannot precede the Patch date' using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
  );

  select * into v_achievement
  from public.achievements
  where owner_id = v_user_id and idempotency_key = p_operation_id;
  if found then
    select j.id into v_job_id
    from public.achievement_generation_jobs j
    where j.achievement_id = v_achievement.id
    order by j.created_at desc
    limit 1;
    return query select v_achievement.id, v_job_id, v_achievement.lifecycle_status, v_achievement.status, true;
    return;
  end if;

  insert into public.achievements (
    owner_id, title, description, category, achievement_date, target_date,
    visibility, rarity, lifecycle_status, source_kind, status, idempotency_key
  ) values (
    v_user_id, trim(p_title), trim(p_description), p_category, p_event_date,
    case when p_lifecycle_status = 'locked' then p_target_date else null end,
    p_visibility, p_rarity, p_lifecycle_status, 'user',
    case when p_lifecycle_status = 'completed' then 'processing' else 'draft' end,
    p_operation_id
  ) returning * into v_achievement;

  insert into public.achievement_events (
    achievement_id, owner_id, operation_id, kind, event_date, title, note
  ) values (
    v_achievement.id, v_user_id, p_operation_id, 'created', p_event_date,
    v_achievement.title, v_achievement.description
  );

  v_job_id := private.create_generation_job_if_needed(v_achievement);
  select * into v_achievement from public.achievements where id = v_achievement.id;
  return query select v_achievement.id, v_job_id, v_achievement.lifecycle_status, v_achievement.status, false;
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
  v_patch public.achievements%rowtype;
  v_job_id uuid;
  v_kind public.achievement_event_kind;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;
  if p_event_date is null or p_event_date > current_date then
    raise exception 'event date cannot be in the future' using errcode = 'check_violation';
  end if;

  select * into v_patch from private.assert_patch_owner(p_patch_id);

  if exists (
    select 1 from public.achievement_events e
    where e.owner_id = v_patch.owner_id and e.operation_id = p_operation_id
  ) then
    select j.id into v_job_id
    from public.achievement_generation_jobs j
    where j.achievement_id = v_patch.id
    order by j.created_at desc limit 1;
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
      select 1 from public.achievement_generation_jobs j
      where j.achievement_id = v_patch.id and j.status = 'running'
    ) then
      raise exception 'generation is already running; try again when it settles' using errcode = 'conflict';
    end if;
    update public.achievement_generation_jobs
    set status = 'failed', finished_at = now(), error_message = 'Lifecycle changed before generation completed.'
    where achievement_id = v_patch.id and status = 'queued';
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
  select * into v_patch from public.achievements where id = v_patch.id;
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
  v_patch public.achievements%rowtype;
  v_event public.achievement_events%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_kind = 'created' then
    raise exception 'created events are managed by Patch creation' using errcode = 'check_violation';
  end if;
  if p_event_date is null or p_event_date > current_date then
    raise exception 'event date cannot be in the future' using errcode = 'check_violation';
  end if;
  select * into v_patch from private.assert_patch_owner(p_patch_id);
  select * into v_event from public.achievement_events
  where owner_id = v_patch.owner_id and operation_id = p_operation_id;
  if found then return v_event; end if;

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
  v_event public.achievement_events%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null or p_event_date is null or p_event_date > current_date then
    raise exception 'a valid operation and event date are required' using errcode = 'check_violation';
  end if;
  select * into v_event from public.achievement_events
  where id = p_event_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Patch update not found' using errcode = 'no_data_found'; end if;
  if v_event.kind = 'created' then
    raise exception 'the original creation event cannot be edited' using errcode = 'check_violation';
  end if;
  update public.achievement_events
  set event_date = p_event_date, title = p_title, note = p_note, value = p_value, unit = p_unit
  where id = v_event.id
  returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.set_patch_hidden(
  p_patch_id uuid,
  p_hidden boolean,
  p_operation_id uuid
)
returns public.achievements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patch public.achievements%rowtype;
begin
  if (select auth.uid()) is null or p_operation_id is null then
    raise exception 'authentication and an operation id are required' using errcode = 'insufficient_privilege';
  end if;
  select * into v_patch from private.assert_patch_owner(p_patch_id, true);
  update public.achievements
  set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
  where id = v_patch.id
  returning * into v_patch;
  return v_patch;
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
  v_patch public.achievements%rowtype;
begin
  if (select auth.uid()) is null or p_operation_id is null then
    raise exception 'authentication and an operation id are required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 80
    or char_length(trim(coalesce(p_description, ''))) not between 2 and 600
    or p_event_date is null
  then
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
  v_patch public.achievements%rowtype;
begin
  if (select auth.uid()) is null or p_operation_id is null then
    raise exception 'authentication and an operation id are required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 2 and 600
    or p_date is null or p_date > current_date
  then
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

revoke all on function private.assert_patch_owner(uuid, boolean) from public, anon, authenticated;
revoke all on function private.create_generation_job_if_needed(public.achievements) from public, anon, authenticated;
revoke all on function private.validate_achievement_event_owner() from public, anon, authenticated;
revoke all on function public.create_patch_v2(text, text, public.achievement_category, public.achievement_rarity, public.achievement_visibility, public.patch_lifecycle_status, date, date, uuid) from public, anon;
revoke all on function public.set_patch_lifecycle(uuid, public.patch_lifecycle_status, date, text, uuid, boolean) from public, anon;
revoke all on function public.add_patch_event(uuid, public.achievement_event_kind, date, text, text, numeric, text, uuid) from public, anon;
revoke all on function public.update_patch_event(uuid, date, text, text, numeric, text, uuid) from public, anon;
revoke all on function public.set_patch_hidden(uuid, boolean, uuid) from public, anon;
revoke all on function public.update_user_patch(uuid, text, text, public.achievement_category, public.achievement_rarity, public.achievement_visibility, date, date, uuid) from public, anon;
revoke all on function public.update_system_travel_patch(uuid, text, date, uuid) from public, anon;

grant execute on function public.create_patch_v2(text, text, public.achievement_category, public.achievement_rarity, public.achievement_visibility, public.patch_lifecycle_status, date, date, uuid) to authenticated;
grant execute on function public.set_patch_lifecycle(uuid, public.patch_lifecycle_status, date, text, uuid, boolean) to authenticated;
grant execute on function public.add_patch_event(uuid, public.achievement_event_kind, date, text, text, numeric, text, uuid) to authenticated;
grant execute on function public.update_patch_event(uuid, date, text, text, numeric, text, uuid) to authenticated;
grant execute on function public.set_patch_hidden(uuid, boolean, uuid) to authenticated;
grant execute on function public.update_user_patch(uuid, text, text, public.achievement_category, public.achievement_rarity, public.achievement_visibility, date, date, uuid) to authenticated;
grant execute on function public.update_system_travel_patch(uuid, text, date, uuid) to authenticated;
