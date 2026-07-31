alter table public.user_settings
  add column if not exists discover_swipe_guide_seen_at timestamptz;

create or replace function public.mark_discover_swipe_guide_seen_v1(
  p_operation_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seen_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;

  update public.user_settings settings
  set discover_swipe_guide_seen_at = coalesce(
    settings.discover_swipe_guide_seen_at,
    statement_timestamp()
  )
  where settings.user_id = auth.uid()
  returning settings.discover_swipe_guide_seen_at into v_seen_at;

  if not found then
    raise exception 'settings are unavailable' using errcode = 'P0002';
  end if;
  return v_seen_at;
end;
$$;

revoke all on function public.mark_discover_swipe_guide_seen_v1(uuid)
from public, anon;
grant execute on function public.mark_discover_swipe_guide_seen_v1(uuid)
to authenticated;
