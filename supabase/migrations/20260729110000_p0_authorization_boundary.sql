-- P0 authorization boundary: authenticated clients read domain tables and use
-- explicit RPC contracts for every protected mutation. Service-only workers
-- retain only the DML they need for queue processing and account cleanup.

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "achievements_insert_own_processing" on public.achievements;
drop policy if exists "achievements_update_own" on public.achievements;
drop policy if exists "achievements_delete_own" on public.achievements;
drop policy if exists "jobs_insert_own" on public.achievement_generation_jobs;
drop policy if exists "visited_countries_insert_own" on public.visited_countries;
drop policy if exists "visited_countries_update_own" on public.visited_countries;
drop policy if exists "visited_countries_delete_own" on public.visited_countries;

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (username, display_name, bio, avatar_key, is_discoverable, map_is_public)
  on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

revoke all on table public.achievements from public, anon, authenticated;
grant select on table public.achievements to authenticated;
grant select, insert, update, delete on table public.achievements to service_role;

revoke all on table public.achievement_generation_jobs from public, anon, authenticated;
grant select on table public.achievement_generation_jobs to authenticated;
grant select, insert, update, delete on table public.achievement_generation_jobs to service_role;

revoke all on table public.visited_countries from public, anon, authenticated;
grant select on table public.visited_countries to authenticated;
grant select, insert, update, delete on table public.visited_countries to service_role;

-- Existing migrations granted schema-wide utility privileges by default. None
-- of the PostgREST roles creates foreign keys, triggers, or truncates data.
revoke references, trigger, truncate on all tables in schema public
  from public, anon, authenticated, service_role;
alter default privileges in schema public
  revoke references, trigger, truncate on tables from public, anon, authenticated, service_role;

-- The catalog was already the source for travel-reward reconciliation. Make
-- it the database boundary for every persisted country code as well.
alter table public.visited_countries
  add constraint visited_countries_country_catalog_fkey
  foreign key (country_code) references public.country_catalog(country_code)
  not valid;
alter table public.visited_countries
  validate constraint visited_countries_country_catalog_fkey;

create or replace function public.complete_onboarding_v1(
  p_username text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := lower(trim(coalesce(p_username, '')));
  v_display_name text := trim(coalesce(p_display_name, ''));
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_username !~ '^[a-z0-9_]{3,24}$'
    or char_length(v_display_name) not between 1 and 80 then
    raise exception 'invalid onboarding fields' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    insert into public.user_settings (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;
    return;
  end if;

  begin
    insert into public.profiles (
      id, username, display_name, avatar_key, onboarding_completed
    ) values (
      v_user_id, v_username, v_display_name, 'trail', true
    );
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;

  insert into public.user_settings (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.mark_patch_collection_viewed(
  p_patch_id uuid
)
returns table (id uuid, collection_viewed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare v_patch public.achievements%rowtype;
begin
  select * into v_patch from private.assert_patch_owner(p_patch_id);
  update public.achievements
  set collection_viewed_at = coalesce(collection_viewed_at, now())
  where achievements.id = v_patch.id
  returning achievements.id, achievements.collection_viewed_at into id, collection_viewed_at;
  return next;
end;
$$;

create or replace function public.mark_patch_reveal_viewed(
  p_patch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_patch public.achievements%rowtype;
begin
  select * into v_patch from private.assert_patch_owner(p_patch_id);
  update public.achievements
  set reveal_viewed_at = coalesce(reveal_viewed_at, now())
  where achievements.id = v_patch.id;
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

  select coalesce(array_agg(a.id), array[]::uuid[])
  into v_active_before
  from public.achievements a
  where a.owner_id = v_user_id
    and a.revoked_at is null
    and a.source_kind <> 'user';

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

  perform private.reconcile_world_patches(v_user_id);
  return query
  select coalesce(array_agg(a.id), array[]::uuid[])
  from public.achievements a
  where a.owner_id = v_user_id
    and a.revoked_at is null
    and a.source_kind <> 'user'
    and not (a.id = any(v_active_before));
end;
$$;

create or replace function public.remove_country_visit_v2(
  p_country_code text,
  p_operation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_country_code, '')));
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_code !~ '^[A-Z]{2}$'
    or not exists (select 1 from public.country_catalog where country_code = v_code)
    or p_operation_id is null then
    raise exception 'invalid removal operation' using errcode = '22023';
  end if;
  insert into public.travel_operations (user_id, operation_id)
  values (v_user_id, p_operation_id)
  on conflict do nothing;
  if not found then
    return;
  end if;
  delete from public.visited_countries
  where user_id = v_user_id and country_code = v_code;
  perform private.reconcile_world_patches(v_user_id);
end;
$$;

revoke all on function public.claim_achievement_generation_jobs(integer, text, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_achievement_generation_job(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.complete_achievement_generation_job(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_achievement_generation_job(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.complete_onboarding_v1(text, text),
  public.mark_patch_collection_viewed(uuid),
  public.mark_patch_reveal_viewed(uuid)
  from public, anon;

grant execute on function public.complete_onboarding_v1(text, text),
  public.mark_patch_collection_viewed(uuid),
  public.mark_patch_reveal_viewed(uuid)
  to authenticated;
