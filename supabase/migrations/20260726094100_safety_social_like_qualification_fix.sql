-- Keep the already-applied expand migration immutable; qualify this column so
-- PL/pgSQL does not confuse the return-column name with the table field.
create or replace function public.toggle_achievement_like(
  p_achievement_id uuid,
  p_liked boolean
)
returns table (liked boolean, like_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_like_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.achievements a
    where a.id = p_achievement_id
      and a.owner_id <> v_user_id
      and a.status = 'completed'
      and a.lifecycle_status = 'completed'
      and a.visibility = 'public'
      and a.hidden_at is null
      and a.revoked_at is null
      and a.moderation_status = 'active'
      and not private.users_are_blocked(v_user_id, a.owner_id)
  ) then
    raise exception 'Patch is unavailable' using errcode = '42501';
  end if;
  if p_liked then
    insert into public.likes (user_id, achievement_id) values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;
  else
    delete from public.likes where user_id = v_user_id and achievement_id = p_achievement_id;
  end if;
  select a.like_count into v_like_count from public.achievements a where a.id = p_achievement_id;
  return query select p_liked, coalesce(v_like_count, 0);
end;
$$;
