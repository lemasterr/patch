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
begin
  update public.achievements
  set like_count = greatest(0, like_count + v_delta)
  where id = v_achievement_id
  returning owner_id into v_owner_id;

  update public.profiles
  set total_received_likes = greatest(0, total_received_likes + v_delta)
  where id = v_owner_id;

  if tg_op = 'INSERT' and new.user_id <> v_owner_id and coalesce((
    select s.in_app_notifications and s.like_notifications
    from public.user_settings s where s.user_id = v_owner_id
  ), true) then
    select display_name into v_actor_name from public.profiles where id = new.user_id;
    insert into public.notifications (
      owner_id, type, achievement_id, actor_id, title, body, link, dedupe_key
    ) values (
      v_owner_id,
      'achievement_liked',
      new.achievement_id,
      new.user_id,
      'Someone liked your achievement',
      coalesce(v_actor_name, 'Another traveler') || ' liked one of your moments.',
      '/achievements/' || new.achievement_id::text,
      'like:' || new.achievement_id::text || ':' || new.user_id::text
    ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.handle_like_change() from public, anon, authenticated;
