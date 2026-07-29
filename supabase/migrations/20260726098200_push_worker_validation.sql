-- Persisting a worker id is unnecessary for token-safe delivery rows, but it
-- is validated to make the worker contract explicit and lint-clean.
create or replace function public.claim_push_deliveries(
  p_worker_id text,
  p_limit integer default 50,
  p_lease_seconds integer default 120
)
returns table (id uuid, expo_push_token text, title text, body text, link text, type public.notification_type, lease_token uuid)
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
  return query
  with candidates as (
    select d.id from public.push_deliveries d join public.push_devices device on device.id = d.device_id
    where d.status = 'queued' and d.available_at <= now() and device.enabled and device.disabled_at is null
    order by d.available_at, d.created_at for update of d skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), claimed as (
    update public.push_deliveries d set status = 'running', lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 30), 600)), attempt = d.attempt + 1, error_code = null, error_message = null
    from candidates c where d.id = c.id returning d.*
  )
  select c.id, device.expo_push_token, c.title, c.body, c.link, c.type, c.lease_token from claimed c join public.push_devices device on device.id = c.device_id;
end;
$$;
