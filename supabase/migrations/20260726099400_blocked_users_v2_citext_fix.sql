-- `profiles.username` is citext; cast the public projection explicitly to the
-- declared text return type so PL/pgSQL's composite return contract is exact.
create or replace function public.get_blocked_users_v2()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_key text,
  blocked_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.id, p.username::text, p.display_name, p.avatar_key, b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc, p.id;
end;
$$;
