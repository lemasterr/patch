-- Runtime flags are product controls for already-released client surfaces.
-- They are intentionally not an authorization mechanism: RLS and RPC checks
-- remain authoritative even when a client-side surface is disabled.
insert into public.feature_flags (key, enabled, rollout_percentage)
values
  ('patch_creation_enabled', true, 100),
  ('discover_enabled', true, 100),
  ('social_enabled', true, 100),
  ('travel_enabled', true, 100),
  ('push_enabled', true, 100)
on conflict (key) do nothing;

create or replace function private.feature_flag_enabled(
  p_user_id uuid,
  p_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select flag.enabled
      and (
        (pg_catalog.hashtextextended(p_user_id::text || ':' || flag.key, 0)
          & 2147483647) % 100
      ) < flag.rollout_percentage
    from public.feature_flags flag
    where flag.key = p_key
  ), true);
$$;

create or replace function private.push_delivery_enabled(
  p_settings public.user_settings,
  p_type public.notification_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.push_type_enabled(p_settings, p_type)
    and private.feature_flag_enabled(p_settings.user_id, 'push_enabled');
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
  if not found or not private.push_delivery_enabled(v_settings, new.type) then
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
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 120 then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  -- Preferences can change after a notification created a queue row. Mark the
  -- delivery terminal rather than leaving it claimable or retrying it forever.
  update public.push_deliveries delivery
  set status = 'disabled',
      lease_token = null,
      lease_expires_at = null,
      error_code = 'preference_disabled',
      error_message = 'Push delivery disabled by current preferences.',
      updated_at = now()
  from public.user_settings settings
  where delivery.status = 'queued'
    and settings.user_id = delivery.user_id
    and not private.push_delivery_enabled(settings, delivery.type);

  return query
  with candidates as (
    select delivery.id
    from public.push_deliveries delivery
    join public.push_devices device on device.id = delivery.device_id
    join public.user_settings settings on settings.user_id = delivery.user_id
    where delivery.status = 'queued'
      and delivery.available_at <= now()
      and device.enabled
      and device.disabled_at is null
      and private.push_delivery_enabled(settings, delivery.type)
    order by delivery.available_at, delivery.created_at
    for update of delivery skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), claimed as (
    update public.push_deliveries delivery
    set status = 'running',
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(
          secs => least(greatest(coalesce(p_lease_seconds, 120), 30), 600)
        ),
        attempt = delivery.attempt + 1,
        error_code = null,
        error_message = null
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select claimed.id, device.expo_push_token, claimed.title, claimed.body,
    claimed.link, claimed.type, claimed.lease_token
  from claimed
  join public.push_devices device on device.id = claimed.device_id;
end;
$$;

revoke all on function private.feature_flag_enabled(uuid, text),
  private.push_delivery_enabled(public.user_settings, public.notification_type)
from public, anon, authenticated;
