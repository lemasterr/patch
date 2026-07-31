-- P0: profile aggregates must never reveal private Patch state, and an Expo
-- push token must be attached to one durable installation rather than a
-- native APNs/FCM token or a globally shared local key.

alter table public.profiles
  add column if not exists owner_achievement_count integer not null default 0
    check (owner_achievement_count >= 0),
  add column if not exists owner_total_received_likes integer not null default 0
    check (owner_total_received_likes >= 0);

create or replace function private.is_active_patch(p_patch public.achievements)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_patch.status = 'completed'
    and p_patch.lifecycle_status = 'completed'
    and p_patch.revoked_at is null
    and p_patch.hidden_at is null
    and p_patch.moderation_status = 'active';
$$;

create or replace function private.is_public_visible_patch(
  p_patch public.achievements
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.is_active_patch(p_patch)
    and p_patch.visibility = 'public';
$$;

create or replace function private.sync_profile_aggregates(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null then
    return;
  end if;

  update public.profiles profile
  set achievement_count = (
        select count(*)::integer
        from public.achievements patch
        where patch.owner_id = p_owner_id
          and private.is_public_visible_patch(patch)
      ),
      owner_achievement_count = (
        select count(*)::integer
        from public.achievements patch
        where patch.owner_id = p_owner_id
          and private.is_active_patch(patch)
      ),
      total_received_likes = (
        select count(*)::integer
        from public.likes like_row
        join public.achievements patch on patch.id = like_row.achievement_id
        where patch.owner_id = p_owner_id
          and private.is_public_visible_patch(patch)
      ),
      owner_total_received_likes = (
        select count(*)::integer
        from public.likes like_row
        join public.achievements patch on patch.id = like_row.achievement_id
        where patch.owner_id = p_owner_id
          and private.is_active_patch(patch)
      )
  where profile.id = p_owner_id;
end;
$$;

create or replace function private.sync_achievement_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_profile_aggregates(coalesce(new.owner_id, old.owner_id));
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    perform private.sync_profile_aggregates(old.owner_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists achievements_sync_profile_count on public.achievements;
create trigger achievements_sync_profile_count
after insert or delete or update of status, lifecycle_status, revoked_at, hidden_at,
  moderation_status, visibility, owner_id on public.achievements
for each row execute function private.sync_achievement_count();

create or replace function private.handle_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_achievement_id uuid := coalesce(new.achievement_id, old.achievement_id);
  v_owner_id uuid;
  v_actor_name text;
  v_delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  v_settings public.user_settings%rowtype;
  v_title text := 'Someone liked your achievement';
  v_body text;
  v_link text;
begin
  update public.achievements
  set like_count = greatest(0, like_count + v_delta)
  where id = v_achievement_id
  returning owner_id into v_owner_id;

  perform private.sync_profile_aggregates(v_owner_id);

  if tg_op <> 'INSERT' or new.user_id = v_owner_id then
    return coalesce(new, old);
  end if;

  select * into v_settings from public.user_settings where user_id = v_owner_id;
  select display_name into v_actor_name from public.profiles where id = new.user_id;
  v_body := coalesce(v_actor_name, 'Another traveler') || ' liked one of your moments.';
  v_link := '/achievements/' || new.achievement_id::text;

  if coalesce(v_settings.in_app_notifications and v_settings.like_notifications, true) then
    insert into public.notifications (
      owner_id, type, achievement_id, actor_id, title, body, link, dedupe_key
    ) values (
      v_owner_id, 'achievement_liked', new.achievement_id, new.user_id,
      v_title, v_body, v_link,
      'like:' || new.achievement_id::text || ':' || new.user_id::text
    ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
  elsif coalesce(v_settings.push_notifications and v_settings.push_likes, true) then
    insert into public.push_deliveries (user_id, device_id, type, title, body, link)
    select
      v_owner_id,
      device.id,
      'achievement_liked',
      v_title,
      case when coalesce(v_settings.push_private_preview, false)
        then v_body else 'Open Patch to see your new activity.' end,
      v_link
    from public.push_devices device
    where device.user_id = v_owner_id and device.enabled and device.disabled_at is null;
  end if;
  return new;
end;
$$;

-- Public profile reads remain possible, but owner-only aggregates can only be
-- returned through the authenticated, no-argument RPC below.
revoke select on table public.profiles from authenticated;
grant select (
  id, username, display_name, bio, avatar_key, is_discoverable, map_is_public,
  onboarding_completed, achievement_count, total_received_likes, friend_count,
  created_at, updated_at
) on table public.profiles to authenticated;

create or replace function public.get_current_profile_summary()
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
  owner_total_received_likes integer
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
    profile.owner_total_received_likes
  from public.profiles profile
  where profile.id = auth.uid();
end;
$$;

revoke all on function private.is_active_patch(public.achievements),
  private.is_public_visible_patch(public.achievements),
  private.sync_profile_aggregates(uuid)
from public, anon, authenticated;
revoke all on function public.get_current_profile_summary() from public, anon;
grant execute on function public.get_current_profile_summary() to authenticated;

select private.sync_profile_aggregates(profile.id)
from public.profiles profile;

alter table public.push_devices
  add column if not exists installation_id text;

update public.push_devices
set installation_id = 'legacy-' || replace(id::text, '-', '')
where installation_id is null;

alter table public.push_devices
  alter column installation_id set not null;

create unique index if not exists push_devices_installation_id_key
  on public.push_devices (installation_id);

alter table public.push_devices
  add constraint push_devices_installation_id_format
  check (installation_id ~ '^[a-z0-9][a-z0-9-]{15,95}$') not valid,
  add constraint push_devices_expo_push_token_format
  check (expo_push_token ~ '^Expo(nent)?PushToken[[][A-Za-z0-9_-]+[]]$') not valid;

create or replace function public.register_push_device(
  p_expo_push_token text,
  p_platform text,
  p_installation_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := trim(coalesce(p_expo_push_token, ''));
  v_installation_id text := lower(trim(coalesce(p_installation_id, '')));
  v_installation_device_id uuid;
  v_token_device_id uuid;
  v_device_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_token !~ '^Expo(nent)?PushToken[[][A-Za-z0-9_-]+[]]$'
    or p_platform not in ('ios', 'android')
    or v_installation_id !~ '^[a-z0-9][a-z0-9-]{15,95}$' then
    raise exception 'invalid push device' using errcode = '22023';
  end if;

  select id into v_installation_device_id
  from public.push_devices
  where installation_id = v_installation_id
  for update;

  select id into v_token_device_id
  from public.push_devices
  where expo_push_token = v_token
  for update;

  -- A stale duplicate token is safe to retire: any pending delivery attached
  -- to it belongs to an old registration and must not leak to this account.
  if v_token_device_id is not null
    and v_token_device_id is distinct from v_installation_device_id then
    update public.push_deliveries delivery
    set status = 'disabled',
        error_code = 'device_replaced',
        error_message = 'Push device registration was replaced.',
        lease_token = null,
        lease_expires_at = null,
        updated_at = now()
    where delivery.device_id = v_token_device_id
      and delivery.status in ('queued', 'running');
    delete from public.push_devices where id = v_token_device_id;
  end if;

  if v_installation_device_id is not null then
    update public.push_deliveries delivery
    set status = 'disabled',
        error_code = 'account_switched',
        error_message = 'Push installation moved to another account.',
        lease_token = null,
        lease_expires_at = null,
        updated_at = now()
    where delivery.device_id = v_installation_device_id
      and delivery.user_id <> v_user_id
      and delivery.status in ('queued', 'running');

    update public.push_devices
    set user_id = v_user_id,
        expo_push_token = v_token,
        platform = p_platform,
        enabled = true,
        disabled_at = null,
        last_seen_at = now()
    where id = v_installation_device_id
    returning id into v_device_id;
  else
    insert into public.push_devices (
      user_id, installation_id, expo_push_token, platform, enabled, disabled_at, last_seen_at
    ) values (
      v_user_id, v_installation_id, v_token, p_platform, true, null, now()
    ) returning id into v_device_id;
  end if;

  return v_device_id;
end;
$$;

-- Keep the prior RPC signature for an already-installed client while giving
-- it a deterministic legacy installation handle. New clients always use the
-- three-argument contract above.
create or replace function public.register_push_device(
  p_expo_push_token text,
  p_platform text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.register_push_device(
    p_expo_push_token,
    p_platform,
    'legacy-' || md5(trim(coalesce(p_expo_push_token, '')))
  );
$$;

create or replace function public.disable_push_installation(
  p_installation_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  select id into v_device_id
  from public.push_devices
  where user_id = auth.uid()
    and installation_id = lower(trim(coalesce(p_installation_id, '')))
  for update;

  if v_device_id is null then
    return;
  end if;

  update public.push_devices
  set enabled = false, disabled_at = now(), last_seen_at = now()
  where id = v_device_id;
  update public.push_deliveries delivery
  set status = 'disabled',
      error_code = 'device_disabled',
      error_message = 'Push device disabled by account sign out.',
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where delivery.device_id = v_device_id
    and delivery.status in ('queued', 'running');
end;
$$;

revoke all on function public.register_push_device(text, text, text),
  public.disable_push_installation(text)
from public, anon;
grant execute on function public.register_push_device(text, text, text),
  public.disable_push_installation(text)
to authenticated;
