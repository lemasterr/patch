-- Fenced completion is worker-only; keep the applied queue migration immutable.
create or replace function public.complete_push_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_ticket_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;
  update public.push_deliveries
  set status = 'sent', provider_ticket_id = nullif(trim(coalesce(p_ticket_id, '')), ''),
      lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_delivery_id
    and status = 'running'
    and lease_token = p_lease_token;
  return found;
end;
$$;
