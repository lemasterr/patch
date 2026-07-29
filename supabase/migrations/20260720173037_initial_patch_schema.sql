create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.achievement_category as enum (
  'adventure', 'travel', 'personal', 'social', 'creativity', 'learning',
  'health', 'work', 'everyday', 'funny', 'other'
);
create type public.achievement_visibility as enum ('public', 'private');
create type public.achievement_rarity as enum ('common', 'uncommon', 'rare', 'epic', 'legendary');
create type public.achievement_status as enum ('draft', 'processing', 'completed', 'failed');
create type public.generation_job_status as enum ('queued', 'running', 'completed', 'failed');
create type public.notification_type as enum (
  'achievement_completed', 'achievement_failed', 'achievement_liked'
);
create type public.feed_action_type as enum ('skip', 'like');
create type public.theme_preference as enum ('system', 'light', 'dark');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext not null unique,
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text check (bio is null or char_length(bio) <= 240),
  avatar_key text not null default 'trail' check (avatar_key in ('trail', 'summit', 'camp', 'compass', 'river', 'sunrise', 'forest', 'stargaze')),
  is_discoverable boolean not null default true,
  achievement_count integer not null default 0 check (achievement_count >= 0),
  total_received_likes integer not null default 0 check (total_received_likes >= 0),
  onboarding_completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,24}$')
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text not null check (char_length(description) between 2 and 600),
  category public.achievement_category not null,
  achievement_date date not null,
  visibility public.achievement_visibility not null default 'public',
  rarity public.achievement_rarity not null,
  location_text text check (location_text is null or char_length(location_text) <= 100),
  tags text[] not null default '{}',
  status public.achievement_status not null default 'processing',
  idempotency_key uuid not null,
  cover_key text,
  cover_url text,
  image_provider text,
  failure_reason text,
  completed_at timestamptz,
  reveal_viewed_at timestamptz,
  like_count integer not null default 0 check (like_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  constraint achievement_tags_limit check (cardinality(tags) <= 10),
  constraint completed_achievement_has_cover check (
    status <> 'completed' or ((cover_key is not null or cover_url is not null) and completed_at is not null)
  ),
  constraint failed_achievement_has_reason check (status <> 'failed' or failure_reason is not null)
);

create table public.achievement_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status public.generation_job_status not null default 'queued',
  attempt integer not null default 1 check (attempt between 1 and 5),
  provider text not null default 'local-pixel',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (achievement_id, attempt)
);

create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  achievement_id uuid references public.achievements(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 220),
  link text not null check (link like '/%'),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index notifications_owner_dedupe_idx
  on public.notifications (owner_id, dedupe_key)
  where dedupe_key is not null;

create table public.feed_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  action public.feed_action_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  default_visibility public.achievement_visibility not null default 'public',
  in_app_notifications boolean not null default true,
  browser_notifications boolean not null default false,
  like_notifications boolean not null default true,
  theme public.theme_preference not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index achievements_owner_status_idx on public.achievements (owner_id, status, created_at desc);
create index achievements_public_feed_idx on public.achievements (created_at desc)
  where status = 'completed' and visibility = 'public';
create index achievements_category_idx on public.achievements (category);
create index achievements_rarity_idx on public.achievements (rarity);
create index generation_jobs_owner_status_idx on public.achievement_generation_jobs (owner_id, status, created_at desc);
create index generation_jobs_achievement_idx on public.achievement_generation_jobs (achievement_id);
create index likes_achievement_idx on public.likes (achievement_id);
create index notifications_owner_unread_idx on public.notifications (owner_id, created_at desc)
  where read_at is null;
create index feed_actions_user_idx on public.feed_actions (user_id, updated_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger achievements_set_updated_at before update on public.achievements
for each row execute function private.set_updated_at();
create trigger jobs_set_updated_at before update on public.achievement_generation_jobs
for each row execute function private.set_updated_at();
create trigger feed_actions_set_updated_at before update on public.feed_actions
for each row execute function private.set_updated_at();
create trigger settings_set_updated_at before update on public.user_settings
for each row execute function private.set_updated_at();

create or replace function private.validate_achievement_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status = 'processing') or
    (old.status = 'processing' and new.status in ('completed', 'failed')) or
    (old.status = 'failed' and new.status = 'processing')
  ) then
    raise exception 'invalid achievement status transition from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger achievements_validate_status before update of status on public.achievements
for each row execute function private.validate_achievement_status_transition();

create or replace function private.sync_achievement_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := coalesce(new.owner_id, old.owner_id);
begin
  update public.profiles
  set achievement_count = (
    select count(*)::integer from public.achievements
    where owner_id = v_owner_id and status = 'completed'
  )
  where id = v_owner_id;
  return coalesce(new, old);
end;
$$;

create trigger achievements_sync_profile_count
after insert or delete or update of status on public.achievements
for each row execute function private.sync_achievement_count();

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

create trigger likes_update_counts
after insert or delete on public.likes
for each row execute function private.handle_like_change();

create or replace function public.create_achievement_with_job(
  p_title text,
  p_description text,
  p_category public.achievement_category,
  p_achievement_date date,
  p_visibility public.achievement_visibility,
  p_rarity public.achievement_rarity,
  p_location_text text,
  p_tags text[],
  p_idempotency_key uuid
)
returns table (achievement_id uuid, job_id uuid, was_existing boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_achievement_id uuid;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select a.id into v_achievement_id
  from public.achievements a
  where a.owner_id = v_user_id and a.idempotency_key = p_idempotency_key;

  if v_achievement_id is not null then
    select j.id into v_job_id
    from public.achievement_generation_jobs j
    where j.achievement_id = v_achievement_id
    order by j.attempt desc limit 1;
    return query select v_achievement_id, v_job_id, true;
    return;
  end if;

  insert into public.achievements (
    owner_id, title, description, category, achievement_date, visibility,
    rarity, location_text, tags, status, idempotency_key
  ) values (
    v_user_id, p_title, p_description, p_category, p_achievement_date, p_visibility,
    p_rarity, nullif(trim(p_location_text), ''), coalesce(p_tags, '{}'), 'processing', p_idempotency_key
  ) returning id into v_achievement_id;

  insert into public.achievement_generation_jobs (achievement_id, owner_id)
  values (v_achievement_id, v_user_id)
  returning id into v_job_id;

  return query select v_achievement_id, v_job_id, false;
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
  v_user_id uuid := (select auth.uid());
  v_like_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_liked then
    insert into public.likes (user_id, achievement_id)
    values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;

    insert into public.feed_actions (user_id, achievement_id, action)
    values (v_user_id, p_achievement_id, 'like')
    on conflict (user_id, achievement_id)
    do update set action = 'like', updated_at = now();
  else
    delete from public.likes
    where user_id = v_user_id and achievement_id = p_achievement_id;
  end if;

  select a.like_count into v_like_count
  from public.achievements a where a.id = p_achievement_id;

  return query select p_liked, coalesce(v_like_count, 0);
end;
$$;

create or replace function public.record_feed_action(
  p_achievement_id uuid,
  p_action public.feed_action_type
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.feed_actions (user_id, achievement_id, action)
  values ((select auth.uid()), p_achievement_id, p_action)
  on conflict (user_id, achievement_id)
  do update set action = excluded.action, updated_at = now();
$$;

alter table public.profiles enable row level security;
alter table public.achievements enable row level security;
alter table public.achievement_generation_jobs enable row level security;
alter table public.likes enable row level security;
alter table public.notifications enable row level security;
alter table public.feed_actions enable row level security;
alter table public.user_settings enable row level security;

create policy "profiles_read_discoverable_or_own" on public.profiles for select to authenticated
using (is_discoverable or (select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "achievements_read_accessible" on public.achievements for select to authenticated
using (
  (select auth.uid()) = owner_id or
  (status = 'completed' and visibility = 'public')
);
create policy "achievements_insert_own_processing" on public.achievements for insert to authenticated
with check ((select auth.uid()) = owner_id and status in ('draft', 'processing'));
create policy "achievements_update_own" on public.achievements for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "achievements_delete_own" on public.achievements for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "jobs_read_own" on public.achievement_generation_jobs for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "jobs_insert_own" on public.achievement_generation_jobs for insert to authenticated
with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.achievements a
    where a.id = achievement_id and a.owner_id = (select auth.uid())
  )
);

create policy "likes_read_accessible" on public.likes for select to authenticated
using (
  (select auth.uid()) = user_id or exists (
    select 1 from public.achievements a
    where a.id = achievement_id and a.status = 'completed' and a.visibility = 'public'
  )
);
create policy "likes_insert_own_public_achievement" on public.likes for insert to authenticated
with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.achievements a
    where a.id = achievement_id
      and a.status = 'completed'
      and a.visibility = 'public'
      and a.owner_id <> (select auth.uid())
  )
);
create policy "likes_delete_own" on public.likes for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "notifications_read_own" on public.notifications for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "notifications_mark_own" on public.notifications for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "feed_actions_read_own" on public.feed_actions for select to authenticated
using ((select auth.uid()) = user_id);
create policy "feed_actions_insert_own" on public.feed_actions for insert to authenticated
with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.achievements a
    where a.id = achievement_id
      and a.status = 'completed'
      and a.visibility = 'public'
      and a.owner_id <> (select auth.uid())
  )
);
create policy "feed_actions_update_own" on public.feed_actions for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "feed_actions_delete_own" on public.feed_actions for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "settings_read_own" on public.user_settings for select to authenticated
using ((select auth.uid()) = user_id);
create policy "settings_insert_own" on public.user_settings for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "settings_update_own" on public.user_settings for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, delete on public.achievements to authenticated;
grant update (title, description, category, achievement_date, visibility, rarity, location_text, tags, reveal_viewed_at) on public.achievements to authenticated;
grant select, insert on public.achievement_generation_jobs to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.feed_actions to authenticated;
grant select, insert, update on public.user_settings to authenticated;

revoke all on function public.create_achievement_with_job(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, text[], uuid) from public, anon;
revoke all on function public.toggle_achievement_like(uuid, boolean) from public, anon;
revoke all on function public.record_feed_action(uuid, public.feed_action_type) from public, anon;
grant execute on function public.create_achievement_with_job(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, text[], uuid) to authenticated;
grant execute on function public.toggle_achievement_like(uuid, boolean) to authenticated;
grant execute on function public.record_feed_action(uuid, public.feed_action_type) to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
