-- Recommendation actions are durable preference signals, while feed_actions
-- remain the disposable "current round" exclusion set used by compatible
-- clients. Resetting a round never discards the category model.
create type public.recommendation_action as enum ('like', 'not_for_me', 'skip');

create table public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  category public.achievement_category not null,
  action public.recommendation_action not null,
  operation_id uuid not null,
  score_delta integer not null,
  previous_liked boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create table public.recommendation_category_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category public.achievement_category not null,
  score integer not null default 0 check (score between -100 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create index recommendation_events_user_created_idx
  on public.recommendation_events (user_id, created_at desc);
create index recommendation_scores_user_score_idx
  on public.recommendation_category_scores (user_id, score desc);

create trigger recommendation_scores_set_updated_at
before update on public.recommendation_category_scores
for each row execute function private.set_updated_at();

alter table public.recommendation_events enable row level security;
alter table public.recommendation_category_scores enable row level security;
create policy "recommendation_events_read_own"
on public.recommendation_events for select to authenticated
using (user_id = auth.uid());
create policy "recommendation_scores_read_own"
on public.recommendation_category_scores for select to authenticated
using (user_id = auth.uid());
revoke all on public.recommendation_events, public.recommendation_category_scores from public, anon, authenticated;
grant select on public.recommendation_events, public.recommendation_category_scores to authenticated;

create or replace function public.get_discover_feed_v2(p_limit integer default 24)
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
  cover_key text,
  cover_url text,
  like_count integer,
  created_at timestamptz,
  completed_at timestamptz,
  reveal_viewed_at timestamptz,
  lifecycle_status public.patch_lifecycle_status,
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
  return query
  select
    a.id, a.owner_id, a.title, a.description, a.category, a.rarity, a.status,
    a.visibility, a.achievement_date, a.cover_key, a.cover_url, a.like_count,
    a.created_at, a.completed_at, a.reveal_viewed_at, a.lifecycle_status,
    p.username, p.display_name, p.avatar_key
  from public.achievements a
  join public.profiles p on p.id = a.owner_id
  left join public.recommendation_category_scores score
    on score.user_id = auth.uid() and score.category = a.category
  where a.status = 'completed'
    and a.lifecycle_status = 'completed'
    and a.visibility = 'public'
    and a.hidden_at is null
    and a.revoked_at is null
    and a.moderation_status = 'active'
    and a.owner_id <> auth.uid()
    and p.is_discoverable
    and not private.users_are_blocked(auth.uid(), a.owner_id)
    and not exists (
      select 1 from public.feed_actions f
      where f.user_id = auth.uid() and f.achievement_id = a.id
    )
  order by
    coalesce(score.score, 0) desc,
    -- Deterministic daily jitter prevents a strong preference from removing
    -- exploration or changing order between renders of a single round.
    hashtextextended(a.id::text || current_date::text, 0) desc,
    a.created_at desc,
    a.id desc
  limit v_limit;
end;
$$;

create or replace function public.apply_discover_feedback_v2(
  p_achievement_id uuid,
  p_action public.recommendation_action,
  p_operation_id uuid
)
returns table (
  liked boolean,
  like_count integer,
  previous_liked boolean,
  category_score integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_category public.achievement_category;
  v_owner_id uuid;
  v_previous_liked boolean;
  v_delta integer := case p_action when 'like' then 3 when 'not_for_me' then -2 else 0 end;
  v_like_count integer;
  v_score integer;
  v_existing public.recommendation_events%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;
  select * into v_existing from public.recommendation_events
  where user_id = v_user_id and operation_id = p_operation_id;
  if found then
    select a.like_count into v_like_count from public.achievements a where a.id = v_existing.achievement_id;
    select coalesce(s.score, 0) into v_score from public.recommendation_category_scores s where s.user_id = v_user_id and s.category = v_existing.category;
    return query select v_existing.action = 'like', coalesce(v_like_count, 0), v_existing.previous_liked, coalesce(v_score, 0);
    return;
  end if;
  select a.category, a.owner_id into v_category, v_owner_id
  from public.achievements a
  join public.profiles p on p.id = a.owner_id
  where a.id = p_achievement_id
    and a.status = 'completed'
    and a.lifecycle_status = 'completed'
    and a.visibility = 'public'
    and a.hidden_at is null
    and a.revoked_at is null
    and a.moderation_status = 'active'
    and a.owner_id <> v_user_id
    and p.is_discoverable;
  if not found or private.users_are_blocked(v_user_id, v_owner_id) then
    raise exception 'Patch is unavailable' using errcode = '42501';
  end if;
  select exists (
    select 1 from public.likes l where l.user_id = v_user_id and l.achievement_id = p_achievement_id
  ) into v_previous_liked;
  insert into public.feed_actions (user_id, achievement_id, action, operation_id, previous_liked)
  values (v_user_id, p_achievement_id, case when p_action = 'not_for_me' then 'dislike'::public.feed_action_type else p_action::text::public.feed_action_type end, p_operation_id, v_previous_liked)
  on conflict (user_id, achievement_id) do update set
    action = excluded.action, operation_id = excluded.operation_id, previous_liked = excluded.previous_liked, updated_at = now();
  if p_action = 'like' then
    insert into public.likes (user_id, achievement_id) values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;
  elsif p_action = 'not_for_me' then
    delete from public.likes where user_id = v_user_id and achievement_id = p_achievement_id;
  end if;
  insert into public.recommendation_events (user_id, achievement_id, category, action, operation_id, score_delta, previous_liked)
  values (v_user_id, p_achievement_id, v_category, p_action, p_operation_id, v_delta, v_previous_liked);
  insert into public.recommendation_category_scores (user_id, category, score)
  values (v_user_id, v_category, greatest(-100, least(100, v_delta)))
  on conflict (user_id, category) do update
    set score = greatest(-100, least(100, public.recommendation_category_scores.score + v_delta)),
        updated_at = now()
  returning score into v_score;
  select a.like_count into v_like_count from public.achievements a where a.id = p_achievement_id;
  return query select p_action = 'like', coalesce(v_like_count, 0), v_previous_liked, v_score;
end;
$$;

create or replace function public.undo_discover_feedback_v2(
  p_achievement_id uuid,
  p_operation_id uuid
)
returns table (liked boolean, like_count integer, category_score integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.recommendation_events%rowtype;
  v_like_count integer;
  v_score integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  select * into v_event from public.recommendation_events
  where user_id = v_user_id and achievement_id = p_achievement_id and operation_id = p_operation_id
  for update;
  if not found then
    raise exception 'this feedback can no longer be undone' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.feed_actions f
    where f.user_id = v_user_id and f.achievement_id = p_achievement_id and f.operation_id = p_operation_id
  ) then
    raise exception 'this feedback has been superseded' using errcode = 'P0001';
  end if;
  if v_event.previous_liked then
    insert into public.likes (user_id, achievement_id) values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;
  elsif v_event.action in ('like', 'not_for_me') then
    delete from public.likes where user_id = v_user_id and achievement_id = p_achievement_id;
  end if;
  delete from public.feed_actions where user_id = v_user_id and achievement_id = p_achievement_id and operation_id = p_operation_id;
  delete from public.recommendation_events where id = v_event.id;
  insert into public.recommendation_category_scores (user_id, category, score)
  values (v_user_id, v_event.category, greatest(-100, least(100, -v_event.score_delta)))
  on conflict (user_id, category) do update
    set score = greatest(-100, least(100, public.recommendation_category_scores.score - v_event.score_delta)),
        updated_at = now()
  returning score into v_score;
  select a.like_count into v_like_count from public.achievements a where a.id = p_achievement_id;
  return query select v_event.previous_liked, coalesce(v_like_count, 0), v_score;
end;
$$;

revoke all on function public.get_discover_feed_v2(integer), public.apply_discover_feedback_v2(uuid, public.recommendation_action, uuid), public.undo_discover_feedback_v2(uuid, uuid) from public, anon;
grant execute on function public.get_discover_feed_v2(integer), public.apply_discover_feedback_v2(uuid, public.recommendation_action, uuid), public.undo_discover_feedback_v2(uuid, uuid) to authenticated;
