-- Release-readiness hardening. These changes deliberately live in a new
-- migration so hosted projects receive the same security and idempotency
-- contract as a freshly reset local database.

-- AUD-003: qualify the event row as well as the parent Patch row. Without the
-- qualification PostgreSQL resolved the second moderation_status to `a`.
drop policy if exists "achievement_events_read_accessible" on public.achievement_events;
create policy "achievement_events_read_accessible"
on public.achievement_events for select to authenticated
using (
  not private.users_are_blocked(auth.uid(), owner_id)
  and (
    owner_id = auth.uid()
    or (
      achievement_events.moderation_status = 'active'
      and exists (
        select 1
        from public.achievements a
        where a.id = achievement_events.achievement_id
          and a.visibility = 'public'
          and a.lifecycle_status = 'completed'
          and a.hidden_at is null
          and a.revoked_at is null
          and a.moderation_status = 'active'
      )
    )
  )
);

-- AUD-004: profile counters are maintained by trusted server-side functions
-- and triggers. Clients may update only authored profile fields.
revoke update on table public.profiles from authenticated;
grant update (username, display_name, bio, avatar_key, is_discoverable, map_is_public)
  on table public.profiles to authenticated;

-- Existing friends remain visible even if a person later opts out of search.
-- This makes "discoverable" a discovery control rather than a destructive
-- privacy toggle which caused accepted friendships to disappear from clients.
drop policy if exists "profiles_read_discoverable_or_own" on public.profiles;
create policy "profiles_read_discoverable_or_own"
on public.profiles for select to authenticated
using (
  not private.users_are_blocked(auth.uid(), id)
  and (
    auth.uid() = id
    or is_discoverable
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = profiles.id)
          or (f.addressee_id = auth.uid() and f.requester_id = profiles.id)
        )
    )
  )
);

-- User-authored Patches cannot be moved into the future through direct RPC.
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
declare v_patch public.achievements%rowtype;
begin
  if auth.uid() is null
    or p_operation_id is null
    or char_length(trim(coalesce(p_title, ''))) not between 2 and 80
    or char_length(trim(coalesce(p_description, ''))) not between 2 and 600
    or p_event_date is null
    or p_event_date > current_date then
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

-- AUD-006: only report system Patches that became active in this operation.
-- Replayed operation IDs return an empty result, so opening a country never
-- reopens a historical travel reward.
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
  if v_code !~ '^[A-Z]{2}$' or char_length(v_name) not between 1 and 80 then
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
  )
  values (
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

-- New social cycles must be deliverable after a decline/removal. The durable
-- friendship row is the dedupe generation, not just one side of the pair.
create or replace function public.create_friend_request(p_profile_id uuid)
returns public.friendship_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.friendship_status;
  v_name text;
  v_friendship_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_profile_id is null or p_profile_id = v_user_id then
    raise exception 'a different profile is required' using errcode = '22023';
  end if;
  if private.users_are_blocked(v_user_id, p_profile_id) then
    raise exception 'this profile is unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_profile_id and is_discoverable
  ) then
    raise exception 'profile is unavailable' using errcode = 'no_data_found';
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_user_id, p_profile_id, 'pending')
  on conflict (user_low, user_high) do nothing
  returning id, status into v_friendship_id, v_status;

  if v_status is null then
    select id, status into v_friendship_id, v_status
    from public.friendships
    where user_low = least(v_user_id, p_profile_id)
      and user_high = greatest(v_user_id, p_profile_id);
  else
    select display_name into v_name from public.profiles where id = v_user_id;
    insert into public.notifications (
      owner_id, type, actor_id, title, body, link, dedupe_key
    ) values (
      p_profile_id, 'friend_request', v_user_id, 'Friend request',
      coalesce(v_name, 'A Patch traveler') || ' sent you a friend request.',
      '/friends', 'friend-request:' || v_friendship_id::text
    ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return v_status;
end;
$$;

create or replace function public.respond_to_friend_request(
  p_requester_id uuid,
  p_accept boolean
)
returns public.friendship_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.friendship_status;
  v_name text;
  v_friendship_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if private.users_are_blocked(auth.uid(), p_requester_id) then
    raise exception 'this profile is unavailable' using errcode = '42501';
  end if;
  if p_accept then
    update public.friendships
    set status = 'accepted'
    where requester_id = p_requester_id
      and addressee_id = auth.uid()
      and status = 'pending'
    returning id, status into v_friendship_id, v_status;
  else
    delete from public.friendships
    where requester_id = p_requester_id
      and addressee_id = auth.uid()
      and status = 'pending'
    returning id, 'pending'::public.friendship_status into v_friendship_id, v_status;
  end if;
  if v_status is null then
    raise exception 'friend request is no longer pending' using errcode = 'P0001';
  end if;
  if p_accept then
    select display_name into v_name from public.profiles where id = auth.uid();
    insert into public.notifications (
      owner_id, type, actor_id, title, body, link, dedupe_key
    ) values (
      p_requester_id, 'friend_accepted', auth.uid(), 'Friend request accepted',
      coalesce(v_name, 'A Patch traveler') || ' accepted your friend request.',
      '/user/' || auth.uid()::text, 'friend-accepted:' || v_friendship_id::text
    ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return v_status;
end;
$$;

-- A lease that has already used its eighth attempt must become terminal. This
-- prevents a reclaim followed by claim from producing an invalid attempt 9.
create or replace function public.reclaim_expired_push_deliveries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;
  update public.push_deliveries
  set status = case when attempt >= 8 then 'failed'::public.push_delivery_status else 'queued'::public.push_delivery_status end,
      lease_token = null,
      lease_expires_at = null,
      available_at = case when attempt >= 8 then available_at else now() end,
      error_code = case when attempt >= 8 then 'lease_expired' else error_code end,
      error_message = case when attempt >= 8 then 'Push delivery lease expired after the last attempt.' else error_message end,
      updated_at = now()
  where status = 'running' and lease_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.update_user_patch(uuid, text, text, public.achievement_category, public.achievement_rarity, public.achievement_visibility, date, date, uuid), public.set_country_visit_v2(text, text, public.country_visit_status, integer, integer, text, uuid), public.create_friend_request(uuid), public.respond_to_friend_request(uuid, boolean) from public, anon;
grant execute on function public.update_user_patch(uuid, text, text, public.achievement_category, public.achievement_rarity, public.achievement_visibility, date, date, uuid), public.set_country_visit_v2(text, text, public.country_visit_status, integer, integer, text, uuid), public.create_friend_request(uuid), public.respond_to_friend_request(uuid, boolean) to authenticated;
