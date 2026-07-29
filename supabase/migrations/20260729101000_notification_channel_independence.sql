-- In-app and push channels are independent. A like can create a normal
-- activity item, a direct push delivery, or both according to its own
-- preferences; disabling the in-app list must not silently disable push.
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

  update public.profiles
  set total_received_likes = greatest(0, total_received_likes + v_delta)
  where id = v_owner_id;

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
      d.id,
      'achievement_liked',
      v_title,
      case when coalesce(v_settings.push_private_preview, false) then v_body else 'Open Patch to see your new activity.' end,
      v_link
    from public.push_devices d
    where d.user_id = v_owner_id and d.enabled and d.disabled_at is null;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_like_change() from public, anon, authenticated;
