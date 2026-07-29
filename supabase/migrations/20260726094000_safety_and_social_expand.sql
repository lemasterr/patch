-- Safety precedes social discovery.  All public read and interaction paths use
-- the same server-side block predicate; client-side hiding is only a UX layer.
alter type public.notification_type add value if not exists 'friend_request';
alter type public.notification_type add value if not exists 'friend_accepted';

create type public.friendship_status as enum ('pending', 'accepted');
create type public.report_reason as enum ('spam', 'harassment', 'hate', 'sexual_content', 'self_harm', 'other');

alter table public.profiles
  add column if not exists friend_count integer not null default 0 check (friend_count >= 0);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete restrict,
  achievement_id uuid references public.achievements(id) on delete set null,
  reason public.report_reason not null,
  detail text,
  created_at timestamptz not null default now(),
  constraint reports_detail_length check (detail is null or char_length(trim(detail)) <= 1_200),
  constraint reports_not_self check (reporter_id <> reported_user_id)
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_low uuid generated always as (least(requester_id, addressee_id)) stored,
  user_high uuid generated always as (greatest(requester_id, addressee_id)) stored,
  constraint friendships_not_self check (requester_id <> addressee_id),
  unique (user_low, user_high)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);
create index content_reports_reporter_created_idx on public.content_reports (reporter_id, created_at desc);
create index friendships_user_status_idx on public.friendships (requester_id, status, updated_at desc);
create index friendships_addressee_status_idx on public.friendships (addressee_id, status, updated_at desc);

create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function private.set_updated_at();

create or replace function private.users_are_blocked(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_first is not null
    and p_second is not null
    and exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = p_first and b.blocked_id = p_second)
         or (b.blocker_id = p_second and b.blocked_id = p_first)
    );
$$;

create or replace function private.refresh_friend_counts(p_first uuid, p_second uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set friend_count = (
    select count(*)::integer
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = p.id or f.addressee_id = p.id)
  )
  where p.id in (p_first, p_second);
end;
$$;

create or replace function private.refresh_friend_counts_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_friend_counts(
    coalesce(new.requester_id, old.requester_id),
    coalesce(new.addressee_id, old.addressee_id)
  );
  return coalesce(new, old);
end;
$$;

create trigger friendships_refresh_counts
after insert or update of status or delete on public.friendships
for each row execute function private.refresh_friend_counts_trigger();

-- Harden the pre-existing public table policies now that blocks exist.
drop policy if exists "profiles_read_discoverable_or_own" on public.profiles;
create policy "profiles_read_discoverable_or_own"
on public.profiles for select to authenticated
using (
  (is_discoverable or auth.uid() = id)
  and not private.users_are_blocked(auth.uid(), id)
);

drop policy if exists "achievements_read_accessible" on public.achievements;
create policy "achievements_read_accessible"
on public.achievements for select to authenticated
using (
  not private.users_are_blocked(auth.uid(), owner_id)
  and (
    auth.uid() = owner_id
    or (
      status = 'completed'
      and lifecycle_status = 'completed'
      and visibility = 'public'
      and hidden_at is null
      and revoked_at is null
      and moderation_status = 'active'
    )
  )
);

drop policy if exists "achievement_events_read_accessible" on public.achievement_events;
create policy "achievement_events_read_accessible"
on public.achievement_events for select to authenticated
using (
  not private.users_are_blocked(auth.uid(), owner_id)
  and (
    owner_id = auth.uid()
    or exists (
      select 1 from public.achievements a
      where a.id = achievement_id
        and a.visibility = 'public'
        and a.lifecycle_status = 'completed'
        and a.hidden_at is null
        and a.revoked_at is null
        and a.moderation_status = 'active'
        and moderation_status = 'active'
    )
  )
);

drop policy if exists "likes_read_accessible" on public.likes;
create policy "likes_read_accessible"
on public.likes for select to authenticated
using (
  (auth.uid() = user_id or exists (
    select 1 from public.achievements a
    where a.id = achievement_id
      and a.status = 'completed'
      and a.lifecycle_status = 'completed'
      and a.visibility = 'public'
      and a.hidden_at is null
      and a.revoked_at is null
      and a.moderation_status = 'active'
      and not private.users_are_blocked(auth.uid(), a.owner_id)
  ))
);

drop policy if exists "likes_insert_own_public_achievement" on public.likes;
create policy "likes_insert_own_public_achievement"
on public.likes for insert to authenticated
with check (
  auth.uid() = user_id and exists (
    select 1 from public.achievements a
    where a.id = achievement_id
      and a.status = 'completed'
      and a.lifecycle_status = 'completed'
      and a.visibility = 'public'
      and a.hidden_at is null
      and a.revoked_at is null
      and a.moderation_status = 'active'
      and a.owner_id <> auth.uid()
      and not private.users_are_blocked(auth.uid(), a.owner_id)
  )
);

alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;
alter table public.friendships enable row level security;

create policy "user_blocks_read_own"
on public.user_blocks for select to authenticated
using (blocker_id = auth.uid());
create policy "reports_read_own"
on public.content_reports for select to authenticated
using (reporter_id = auth.uid());
create policy "friendships_read_participant"
on public.friendships for select to authenticated
using (
  (requester_id = auth.uid() or addressee_id = auth.uid())
  and not private.users_are_blocked(auth.uid(), case when requester_id = auth.uid() then addressee_id else requester_id end)
);

revoke all on public.user_blocks, public.content_reports, public.friendships from public, anon, authenticated;
grant select on public.user_blocks, public.content_reports, public.friendships to authenticated;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_user_id is null or p_user_id = v_user_id then
    raise exception 'a different user is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile not found' using errcode = 'no_data_found';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_user_id, p_user_id)
  on conflict do nothing;
  delete from public.friendships
  where (requester_id = v_user_id and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = v_user_id);
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
end;
$$;

create or replace function public.report_content(
  p_reported_user_id uuid,
  p_achievement_id uuid,
  p_reason public.report_reason,
  p_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_reported_user_id is null or p_reported_user_id = v_user_id then
    raise exception 'a different user is required' using errcode = '22023';
  end if;
  if (select count(*) from public.content_reports where reporter_id = v_user_id and created_at > now() - interval '24 hours') >= 8 then
    raise exception 'report limit reached; please try again later' using errcode = '42901';
  end if;
  if p_achievement_id is not null and not exists (
    select 1 from public.achievements where id = p_achievement_id and owner_id = p_reported_user_id
  ) then
    raise exception 'Patch does not belong to reported user' using errcode = '22023';
  end if;
  insert into public.content_reports (reporter_id, reported_user_id, achievement_id, reason, detail)
  values (v_user_id, p_reported_user_id, p_achievement_id, p_reason, nullif(trim(coalesce(p_detail, '')), ''))
  returning id into v_report_id;
  return v_report_id;
end;
$$;

create or replace function public.create_friend_request(p_profile_id uuid)
returns public.friendship_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.friendship_status;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_profile_id is null or p_profile_id = v_user_id then
    raise exception 'a different profile is required' using errcode = '22023';
  end if;
  if private.users_are_blocked(v_user_id, p_profile_id) then
    raise exception 'this profile is unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and is_discoverable) then
    raise exception 'profile is unavailable' using errcode = 'no_data_found';
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_user_id, p_profile_id, 'pending')
  on conflict (user_low, user_high) do nothing
  returning status into v_status;

  if v_status is null then
    select status into v_status from public.friendships
    where user_low = least(v_user_id, p_profile_id) and user_high = greatest(v_user_id, p_profile_id);
  else
    select display_name into v_name from public.profiles where id = v_user_id;
    insert into public.notifications (owner_id, type, actor_id, title, body, link, dedupe_key)
    values (
      p_profile_id, 'friend_request', v_user_id, 'Friend request',
      coalesce(v_name, 'A Patch traveler') || ' sent you a friend request.', '/friends',
      'friend-request:' || v_user_id::text
    ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return v_status;
end;
$$;

create or replace function public.respond_to_friend_request(p_requester_id uuid, p_accept boolean)
returns public.friendship_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.friendship_status;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if private.users_are_blocked(auth.uid(), p_requester_id) then
    raise exception 'this profile is unavailable' using errcode = '42501';
  end if;
  if p_accept then
    update public.friendships
    set status = 'accepted'
    where requester_id = p_requester_id and addressee_id = auth.uid() and status = 'pending'
    returning status into v_status;
  else
    delete from public.friendships
    where requester_id = p_requester_id and addressee_id = auth.uid() and status = 'pending'
    returning 'pending'::public.friendship_status into v_status;
  end if;
  if v_status is null then
    raise exception 'friend request is no longer pending' using errcode = 'P0001';
  end if;
  if p_accept then
    select display_name into v_name from public.profiles where id = auth.uid();
    insert into public.notifications (owner_id, type, actor_id, title, body, link, dedupe_key)
    values (
      p_requester_id, 'friend_accepted', auth.uid(), 'Friend request accepted',
      coalesce(v_name, 'A Patch traveler') || ' accepted your friend request.', '/user/' || auth.uid()::text,
      'friend-accepted:' || auth.uid()::text
    ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return v_status;
end;
$$;

create or replace function public.cancel_friend_request(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  delete from public.friendships
  where requester_id = auth.uid() and addressee_id = p_profile_id and status = 'pending';
end;
$$;

create or replace function public.remove_friend(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  delete from public.friendships
  where status = 'accepted'
    and ((requester_id = auth.uid() and addressee_id = p_profile_id)
      or (requester_id = p_profile_id and addressee_id = auth.uid()));
end;
$$;

create or replace function public.get_friendship_state(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or p_profile_id is null or private.users_are_blocked(auth.uid(), p_profile_id) then 'unavailable'
    when not exists (select 1 from public.friendships f where f.user_low = least(auth.uid(), p_profile_id) and f.user_high = greatest(auth.uid(), p_profile_id)) then 'none'
    when exists (select 1 from public.friendships f where f.user_low = least(auth.uid(), p_profile_id) and f.user_high = greatest(auth.uid(), p_profile_id) and f.status = 'accepted') then 'friends'
    when exists (select 1 from public.friendships f where f.requester_id = auth.uid() and f.addressee_id = p_profile_id and f.status = 'pending') then 'outgoing'
    else 'incoming'
  end;
$$;

create or replace function public.get_friends_v2(p_view text default 'friends')
returns table (
  profile_id uuid,
  username extensions.citext,
  display_name text,
  avatar_key text,
  bio text,
  friend_count integer,
  relationship text,
  requested_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  return query
  select
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    p.username, p.display_name, p.avatar_key, p.bio, p.friend_count,
    case
      when f.status = 'accepted' then 'friends'
      when f.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end,
    f.created_at
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where not private.users_are_blocked(auth.uid(), p.id)
    and (
      (p_view = 'friends' and f.status = 'accepted')
      or (p_view = 'requests' and f.status = 'pending')
    )
  order by f.updated_at desc, p.username;
end;
$$;

create or replace function public.search_profiles(p_query text, p_limit integer default 20)
returns table (
  id uuid,
  username extensions.citext,
  display_name text,
  avatar_key text,
  bio text,
  friend_count integer,
  relationship text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(coalesce(v_query, '')) < 2 then
    return;
  end if;
  return query
  select p.id, p.username, p.display_name, p.avatar_key, p.bio, p.friend_count,
    public.get_friendship_state(p.id)
  from public.profiles p
  where p.id <> auth.uid()
    and p.is_discoverable
    and not private.users_are_blocked(auth.uid(), p.id)
    and (p.username::text ilike v_query || '%' or p.display_name ilike '%' || v_query || '%')
  order by
    case when p.username::text ilike v_query || '%' then 0 else 1 end,
    p.username
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

create or replace function public.get_friend_feed_v2(p_limit integer default 30)
returns table (
  id uuid,
  owner_id uuid,
  title text,
  description text,
  category public.achievement_category,
  rarity public.achievement_rarity,
  achievement_date date,
  cover_key text,
  cover_url text,
  like_count integer,
  created_at timestamptz,
  owner_username extensions.citext,
  owner_display_name text,
  owner_avatar_key text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  return query
  select a.id, a.owner_id, a.title, a.description, a.category, a.rarity,
    a.achievement_date, a.cover_key, a.cover_url, a.like_count, a.created_at,
    p.username, p.display_name, p.avatar_key
  from public.achievements a
  join public.friendships f on f.status = 'accepted'
    and (f.requester_id = auth.uid() and f.addressee_id = a.owner_id
      or f.addressee_id = auth.uid() and f.requester_id = a.owner_id)
  join public.profiles p on p.id = a.owner_id
  where a.status = 'completed'
    and a.lifecycle_status = 'completed'
    and a.visibility = 'public'
    and a.hidden_at is null
    and a.revoked_at is null
    and a.moderation_status = 'active'
    and not private.users_are_blocked(auth.uid(), a.owner_id)
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 60);
end;
$$;

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
  select like_count into v_like_count from public.achievements where id = p_achievement_id;
  return query select p_liked, coalesce(v_like_count, 0);
end;
$$;

revoke all on function public.block_user(uuid), public.unblock_user(uuid), public.report_content(uuid, uuid, public.report_reason, text), public.create_friend_request(uuid), public.respond_to_friend_request(uuid, boolean), public.cancel_friend_request(uuid), public.remove_friend(uuid), public.get_friendship_state(uuid), public.get_friends_v2(text), public.search_profiles(text, integer), public.get_friend_feed_v2(integer) from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.report_content(uuid, uuid, public.report_reason, text), public.create_friend_request(uuid), public.respond_to_friend_request(uuid, boolean), public.cancel_friend_request(uuid), public.remove_friend(uuid), public.get_friendship_state(uuid), public.get_friends_v2(text), public.search_profiles(text, integer), public.get_friend_feed_v2(integer) to authenticated;
revoke all on function private.users_are_blocked(uuid, uuid), private.refresh_friend_counts(uuid, uuid), private.refresh_friend_counts_trigger() from public, anon, authenticated;
