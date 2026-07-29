alter table public.feed_actions
  add column if not exists operation_id uuid,
  add column if not exists previous_liked boolean;

alter table public.feed_actions
  drop constraint if exists feed_actions_operation_snapshot_check;

alter table public.feed_actions
  add constraint feed_actions_operation_snapshot_check
  check (operation_id is null or previous_liked is not null);

create index if not exists achievements_discover_cursor_idx
  on public.achievements (created_at desc, id desc)
  where status = 'completed' and visibility = 'public';

create index if not exists feed_actions_undo_operation_idx
  on public.feed_actions (user_id, operation_id)
  where operation_id is not null;

create or replace function public.get_discover_feed(
  p_limit integer default 24,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  owner_id uuid,
  title text,
  description text,
  category public.achievement_category,
  rarity public.achievement_rarity,
  status public.achievement_status,
  visibility public.achievement_visibility,
  achievement_date date,
  location_text text,
  location_latitude double precision,
  location_longitude double precision,
  cover_key text,
  cover_url text,
  like_count integer,
  created_at timestamptz,
  completed_at timestamptz,
  reveal_viewed_at timestamptz,
  owner_username extensions.citext,
  owner_display_name text,
  owner_avatar_key text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 40);
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'both feed cursor fields are required together' using errcode = '22023';
  end if;

  return query
  select
    a.id,
    a.owner_id,
    a.title,
    a.description,
    a.category,
    a.rarity,
    a.status,
    a.visibility,
    a.achievement_date,
    a.location_text,
    a.location_latitude,
    a.location_longitude,
    a.cover_key,
    a.cover_url,
    a.like_count,
    a.created_at,
    a.completed_at,
    a.reveal_viewed_at,
    p.username,
    p.display_name,
    p.avatar_key
  from public.achievements a
  join public.profiles p on p.id = a.owner_id
  where a.status = 'completed'
    and a.visibility = 'public'
    and a.owner_id <> auth.uid()
    and p.is_discoverable
    and not exists (
      select 1
      from public.feed_actions f
      where f.user_id = auth.uid()
        and f.achievement_id = a.id
    )
    and (
      p_before_created_at is null
      or (a.created_at, a.id) < (p_before_created_at, p_before_id)
    )
  order by a.created_at desc, a.id desc
  limit v_limit;
end;
$$;

create or replace function public.apply_feed_action(
  p_achievement_id uuid,
  p_action public.feed_action_type,
  p_operation_id uuid
)
returns table (
  liked boolean,
  like_count integer,
  previous_liked boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous_liked boolean;
  v_like_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.achievements a
    join public.profiles p on p.id = a.owner_id
    where a.id = p_achievement_id
      and a.status = 'completed'
      and a.visibility = 'public'
      and a.owner_id <> v_user_id
      and p.is_discoverable
  ) then
    raise exception 'achievement is not available in discover' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.likes l
    where l.user_id = v_user_id
      and l.achievement_id = p_achievement_id
  )
  into v_previous_liked;

  insert into public.feed_actions (
    user_id,
    achievement_id,
    action,
    operation_id,
    previous_liked
  )
  values (
    v_user_id,
    p_achievement_id,
    p_action,
    p_operation_id,
    v_previous_liked
  )
  on conflict (user_id, achievement_id)
  do update set
    action = excluded.action,
    operation_id = excluded.operation_id,
    previous_liked = excluded.previous_liked,
    updated_at = now();

  if p_action = 'like' then
    insert into public.likes (user_id, achievement_id)
    values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;
  else
    delete from public.likes
    where user_id = v_user_id
      and achievement_id = p_achievement_id;
  end if;

  select a.like_count
  into v_like_count
  from public.achievements a
  where a.id = p_achievement_id;

  return query select
    p_action = 'like',
    coalesce(v_like_count, 0),
    v_previous_liked;
end;
$$;

create or replace function public.undo_feed_action(
  p_achievement_id uuid,
  p_operation_id uuid
)
returns table (
  liked boolean,
  like_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous_liked boolean;
  v_like_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;

  select f.previous_liked
  into v_previous_liked
  from public.feed_actions f
  where f.user_id = v_user_id
    and f.achievement_id = p_achievement_id
    and f.operation_id = p_operation_id
  for update;

  if not found then
    raise exception 'this feed action can no longer be undone' using errcode = 'P0001';
  end if;

  if v_previous_liked then
    insert into public.likes (user_id, achievement_id)
    values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;
  else
    delete from public.likes
    where user_id = v_user_id
      and achievement_id = p_achievement_id;
  end if;

  delete from public.feed_actions
  where user_id = v_user_id
    and achievement_id = p_achievement_id
    and operation_id = p_operation_id;

  select a.like_count
  into v_like_count
  from public.achievements a
  where a.id = p_achievement_id;

  return query select v_previous_liked, coalesce(v_like_count, 0);
end;
$$;

create or replace function public.reset_discover_round()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  delete from public.feed_actions
  where user_id = auth.uid();
end;
$$;

revoke all on function public.get_discover_feed(integer, timestamptz, uuid) from public, anon;
revoke all on function public.apply_feed_action(uuid, public.feed_action_type, uuid) from public, anon;
revoke all on function public.undo_feed_action(uuid, uuid) from public, anon;
revoke all on function public.reset_discover_round() from public, anon;

grant execute on function public.get_discover_feed(integer, timestamptz, uuid) to authenticated;
grant execute on function public.apply_feed_action(uuid, public.feed_action_type, uuid) to authenticated;
grant execute on function public.undo_feed_action(uuid, uuid) to authenticated;
grant execute on function public.reset_discover_round() to authenticated;
