create type public.push_delivery_status as enum ('queued', 'running', 'sent', 'failed', 'disabled');

alter table public.user_settings
  add column if not exists push_notifications boolean not null default true,
  add column if not exists push_friend_requests boolean not null default true,
  add column if not exists push_friend_accepted boolean not null default true,
  add column if not exists push_likes boolean not null default true,
  add column if not exists push_patch_ready boolean not null default true,
  add column if not exists push_travel_awards boolean not null default true,
  add column if not exists push_private_preview boolean not null default false;

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique check (char_length(expo_push_token) between 20 and 512),
  platform text not null check (platform in ('ios', 'android')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  type public.notification_type not null,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 220),
  link text not null check (link like '/%'),
  status public.push_delivery_status not null default 'queued',
  attempt integer not null default 0 check (attempt between 0 and 8),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_ticket_id text,
  provider_receipt_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, notification_id)
);

create index push_devices_active_user_idx on public.push_devices (user_id, last_seen_at desc) where enabled;
create index push_deliveries_claim_idx on public.push_deliveries (available_at, created_at) where status = 'queued';
create index push_deliveries_lease_idx on public.push_deliveries (lease_expires_at) where status = 'running';

create trigger push_devices_set_updated_at before update on public.push_devices
for each row execute function private.set_updated_at();
create trigger push_deliveries_set_updated_at before update on public.push_deliveries
for each row execute function private.set_updated_at();

alter table public.push_devices enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_devices, public.push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.push_devices, public.push_deliveries to service_role;

create or replace function private.push_type_enabled(p_settings public.user_settings, p_type public.notification_type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_settings.push_notifications, true) and case p_type
    when 'friend_request' then p_settings.push_friend_requests
    when 'friend_accepted' then p_settings.push_friend_accepted
    when 'achievement_liked' then p_settings.push_likes
    when 'achievement_completed' then p_settings.push_patch_ready
    when 'achievement_failed' then p_settings.push_patch_ready
    else true
  end;
$$;

create or replace function private.enqueue_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.user_settings%rowtype;
  v_body text;
begin
  select * into v_settings from public.user_settings where user_id = new.owner_id;
  if not found or not private.push_type_enabled(v_settings, new.type) then
    return new;
  end if;
  v_body := case when v_settings.push_private_preview then new.body else 'Open Patch to see your new activity.' end;
  insert into public.push_deliveries (user_id, device_id, notification_id, type, title, body, link)
  select new.owner_id, d.id, new.id, new.type, new.title, v_body, new.link
  from public.push_devices d
  where d.user_id = new.owner_id and d.enabled and d.disabled_at is null
  on conflict (device_id, notification_id) do nothing;
  return new;
end;
$$;

create trigger notifications_enqueue_push
after insert on public.notifications
for each row execute function private.enqueue_push_for_notification();

create or replace function public.register_push_device(p_expo_push_token text, p_platform text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_device_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(coalesce(p_expo_push_token, ''))) not between 20 and 512
    or p_platform not in ('ios', 'android') then
    raise exception 'invalid push device' using errcode = '22023';
  end if;
  insert into public.push_devices (user_id, expo_push_token, platform, enabled, disabled_at, last_seen_at)
  values (v_user_id, trim(p_expo_push_token), p_platform, true, null, now())
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        enabled = true,
        disabled_at = null,
        last_seen_at = now()
  returning id into v_device_id;
  return v_device_id;
end;
$$;

create or replace function public.disable_push_device(p_expo_push_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  update public.push_devices
  set enabled = false, disabled_at = now()
  where user_id = auth.uid() and expo_push_token = trim(coalesce(p_expo_push_token, ''));
end;
$$;

create or replace function public.claim_push_deliveries(
  p_worker_id text,
  p_limit integer default 50,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  expo_push_token text,
  title text,
  body text,
  link text,
  type public.notification_type,
  lease_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;
  return query
  with candidates as (
    select d.id
    from public.push_deliveries d
    join public.push_devices device on device.id = d.device_id
    where d.status = 'queued'
      and d.available_at <= now()
      and device.enabled and device.disabled_at is null
    order by d.available_at, d.created_at
    for update of d skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), claimed as (
    update public.push_deliveries d
    set status = 'running', lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 30), 600)),
      attempt = d.attempt + 1, error_code = null, error_message = null
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select c.id, device.expo_push_token, c.title, c.body, c.link, c.type, c.lease_token
  from claimed c join public.push_devices device on device.id = c.device_id;
end;
$$;

create or replace function public.complete_push_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_ticket_id text default null
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.push_deliveries
  set status = 'sent', provider_ticket_id = nullif(trim(coalesce(p_ticket_id, '')), ''),
      lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_delivery_id
    and status = 'running'
    and lease_token = p_lease_token
  returning true;
$$;

create or replace function public.fail_push_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;
  select attempt into v_attempt from public.push_deliveries
  where id = p_delivery_id and status = 'running' and lease_token = p_lease_token for update;
  if not found then return false; end if;
  update public.push_deliveries
  set status = case when p_retryable and v_attempt < 8 then 'queued'::public.push_delivery_status else 'failed'::public.push_delivery_status end,
      available_at = case when p_retryable and v_attempt < 8 then now() + make_interval(secs => least(3600, 30 * power(2, greatest(v_attempt - 1, 0))::integer)) else available_at end,
      lease_token = null, lease_expires_at = null,
      error_code = left(coalesce(p_error_code, 'unknown'), 80),
      error_message = left(coalesce(p_error_message, 'Push delivery failed'), 240), updated_at = now()
  where id = p_delivery_id;
  return true;
end;
$$;

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
  set status = 'queued', lease_token = null, lease_expires_at = null, available_at = now(), updated_at = now()
  where status = 'running' and lease_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.register_push_device(text, text), public.disable_push_device(text), public.claim_push_deliveries(text, integer, integer), public.complete_push_delivery(uuid, uuid, text), public.fail_push_delivery(uuid, uuid, text, text, boolean), public.reclaim_expired_push_deliveries() from public, anon;
grant execute on function public.register_push_device(text, text), public.disable_push_device(text) to authenticated;
grant execute on function public.claim_push_deliveries(text, integer, integer), public.complete_push_delivery(uuid, uuid, text), public.fail_push_delivery(uuid, uuid, text, text, boolean), public.reclaim_expired_push_deliveries() to service_role;
revoke all on function private.push_type_enabled(public.user_settings, public.notification_type), private.enqueue_push_for_notification() from public, anon, authenticated;
