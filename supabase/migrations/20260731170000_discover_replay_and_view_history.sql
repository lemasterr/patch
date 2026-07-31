-- Discover v5 separates a stable paging snapshot from durable viewing and
-- feedback history.  The rows below intentionally retain only identifiers and
-- timestamps; current Patch/profile data is joined at read time so removed or
-- private content cannot leak through an old history entry.

alter table public.recommendation_rounds
  add column if not exists kind text not null default 'fresh';

alter table public.recommendation_rounds
  drop constraint if exists recommendation_rounds_kind_check;
alter table public.recommendation_rounds
  add constraint recommendation_rounds_kind_check
  check (kind in ('fresh', 'replay'));

alter table public.recommendation_engagement_events
  drop constraint if exists recommendation_engagement_events_event_type_check;
alter table public.recommendation_engagement_events
  add constraint recommendation_engagement_events_event_type_check
  check (event_type in ('profile_open', 'view', 'impression'));

alter table public.recommendation_events
  add column if not exists previous_action public.feed_action_type,
  add column if not exists previous_operation_id uuid,
  add column if not exists undone_at timestamptz;

create index if not exists recommendation_engagement_impressions_cursor_idx
  on public.recommendation_engagement_events (user_id, created_at desc, id desc)
  where event_type = 'impression';

create or replace function public.start_discover_round_v2(p_kind text default 'fresh')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_round_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('fresh', 'replay') then
    raise exception 'invalid Discover round kind' using errcode = '22023';
  end if;

  -- There is exactly one active deck for an account, regardless of kind.  This
  -- also prevents a stale callback from appending a page to a different mode.
  update public.recommendation_rounds
  set closed_at = statement_timestamp()
  where user_id = v_user_id and closed_at is null;

  insert into public.recommendation_rounds (user_id, kind)
  values (v_user_id, p_kind)
  returning id into v_round_id;
  return v_round_id;
end;
$$;

create or replace function public.get_discover_feed_v5(
  p_round_id uuid default null,
  p_limit integer default 24,
  p_after_rank integer default 0,
  p_kind text default 'fresh'
)
returns table (
  round_id uuid,
  rank integer,
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
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_round_id uuid;
  v_kind text := coalesce(p_kind, 'fresh');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 40);
  v_after_rank integer := greatest(coalesce(p_after_rank, 0), 0);
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_kind not in ('fresh', 'replay') then
    raise exception 'invalid Discover round kind' using errcode = '22023';
  end if;

  if p_round_id is not null then
    select r.id into v_round_id
    from public.recommendation_rounds r
    where r.id = p_round_id and r.user_id = v_user_id and r.kind = v_kind;
    if not found then
      raise exception 'recommendation round is unavailable' using errcode = '42501';
    end if;
  else
    update public.recommendation_rounds
    set closed_at = statement_timestamp()
    where user_id = v_user_id and closed_at is null and expires_at <= statement_timestamp();

    select r.id into v_round_id
    from public.recommendation_rounds r
    where r.user_id = v_user_id and r.kind = v_kind and r.closed_at is null
    order by r.created_at desc
    limit 1;

    if v_round_id is null then
      v_round_id := public.start_discover_round_v2(v_kind);

      if v_kind = 'fresh' then
        insert into public.recommendation_round_items (round_id, rank, achievement_id)
        select v_round_id, ranked.rank, ranked.achievement_id
        from (
          select
            a.id as achievement_id,
            row_number() over (
              order by
                (coalesce(category_score.score, 0) * 10
                  + coalesce(author_score.score, 0) * 8
                  + least(a.like_count, 100)) desc,
                hashtextextended(a.id::text || v_round_id::text, 0) desc,
                a.id
            )::integer as rank
          from public.achievements a
          join public.profiles p on p.id = a.owner_id
          left join public.recommendation_category_scores category_score
            on category_score.user_id = v_user_id
            and category_score.category = a.category
          left join public.recommendation_author_scores author_score
            on author_score.user_id = v_user_id
            and author_score.author_id = a.owner_id
          where a.status = 'completed'
            and a.lifecycle_status = 'completed'
            and a.visibility = 'public'
            and a.hidden_at is null
            and a.revoked_at is null
            and a.moderation_status = 'active'
            and a.owner_id <> v_user_id
            and p.is_discoverable
            and not private.users_are_blocked(v_user_id, a.owner_id)
            and not exists (
              select 1 from public.feed_actions f
              where f.user_id = v_user_id and f.achievement_id = a.id
            )
        ) ranked;
      else
        insert into public.recommendation_round_items (round_id, rank, achievement_id)
        select v_round_id, ranked.rank, ranked.achievement_id
        from (
          select
            latest.achievement_id,
            row_number() over (
              order by latest.viewed_at desc, latest.event_id desc
            )::integer as rank
          from (
            select distinct on (event.achievement_id)
              event.achievement_id,
              event.created_at as viewed_at,
              event.id as event_id
            from public.recommendation_engagement_events event
            join public.achievements a on a.id = event.achievement_id
            join public.profiles p on p.id = a.owner_id
            left join public.feed_actions action
              on action.user_id = v_user_id and action.achievement_id = a.id
            where event.user_id = v_user_id
              and event.event_type = 'impression'
              and a.status = 'completed'
              and a.lifecycle_status = 'completed'
              and a.visibility = 'public'
              and a.hidden_at is null
              and a.revoked_at is null
              and a.moderation_status = 'active'
              and p.is_discoverable
              and not private.users_are_blocked(v_user_id, a.owner_id)
              and coalesce(action.action::text, '') <> 'dislike'
            order by event.achievement_id, event.created_at desc, event.id desc
          ) latest
        ) ranked;
      end if;
    end if;
  end if;

  return query
  select
    v_round_id,
    item.rank,
    a.id, a.owner_id, a.title, a.description, a.category, a.rarity,
    a.status, a.visibility, a.achievement_date, a.cover_key, a.cover_url,
    a.like_count, a.created_at, a.completed_at, a.reveal_viewed_at,
    a.lifecycle_status, p.username, p.display_name, p.avatar_key
  from public.recommendation_round_items item
  join public.achievements a on a.id = item.achievement_id
  join public.profiles p on p.id = a.owner_id
  left join public.feed_actions action
    on action.user_id = v_user_id and action.achievement_id = item.achievement_id
  where item.round_id = v_round_id
    and item.rank > v_after_rank
    and a.status = 'completed'
    and a.lifecycle_status = 'completed'
    and a.visibility = 'public'
    and a.hidden_at is null
    and a.revoked_at is null
    and a.moderation_status = 'active'
    and p.is_discoverable
    and not private.users_are_blocked(v_user_id, a.owner_id)
    and (
      (v_kind = 'fresh' and action.achievement_id is null)
      or (v_kind = 'replay' and coalesce(action.action::text, '') <> 'dislike')
    )
  order by item.rank
  limit v_limit;
end;
$$;

create or replace function public.record_discover_engagement_v2(
  p_achievement_id uuid,
  p_event_type text,
  p_operation_id uuid,
  p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_category public.achievement_category;
  v_owner_id uuid;
  v_round_id uuid;
  v_duration integer := least(greatest(coalesce(p_duration_ms, 0), 0), 600000);
  v_category_delta integer := 0;
  v_author_delta integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_event_type not in ('profile_open', 'view', 'impression') or p_operation_id is null then
    raise exception 'invalid recommendation engagement' using errcode = '22023';
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

  select item.round_id into v_round_id
  from public.recommendation_round_items item
  join public.recommendation_rounds round_state on round_state.id = item.round_id
  where round_state.user_id = v_user_id
    and round_state.closed_at is null
    and item.achievement_id = p_achievement_id
  order by round_state.created_at desc
  limit 1;

  insert into public.recommendation_engagement_events (
    user_id, achievement_id, owner_id, category, event_type, duration_ms, operation_id
  ) values (
    v_user_id, p_achievement_id, v_owner_id, v_category, p_event_type,
    case when p_event_type = 'view' then v_duration else null end, p_operation_id
  ) on conflict (user_id, operation_id) do nothing;
  if not found then return; end if;

  if p_event_type = 'impression' then
    insert into public.recommendation_impressions (user_id, achievement_id, last_round_id)
    values (v_user_id, p_achievement_id, v_round_id)
    on conflict (user_id, achievement_id) do update
      set last_seen_at = statement_timestamp(),
          view_count = public.recommendation_impressions.view_count + 1,
          last_round_id = coalesce(excluded.last_round_id, public.recommendation_impressions.last_round_id);
    return;
  end if;

  v_category_delta := case
    when p_event_type = 'profile_open' then 1
    when v_duration >= 15000 then 2
    when v_duration >= 5000 then 1
    when v_duration < 1000 then -1
    else 0
  end;
  v_author_delta := case
    when p_event_type = 'profile_open' then 2
    when v_duration >= 15000 then 2
    when v_duration >= 5000 then 1
    when v_duration < 1000 then -1
    else 0
  end;

  insert into public.recommendation_category_scores (user_id, category, score)
  values (v_user_id, v_category, greatest(-100, least(100, v_category_delta)))
  on conflict (user_id, category) do update
    set score = greatest(-100, least(100, public.recommendation_category_scores.score + v_category_delta)),
        updated_at = statement_timestamp();
  insert into public.recommendation_author_scores (user_id, author_id, score)
  values (v_user_id, v_owner_id, greatest(-100, least(100, v_author_delta)))
  on conflict (user_id, author_id) do update
    set score = greatest(-100, least(100, public.recommendation_author_scores.score + v_author_delta)),
        updated_at = statement_timestamp();
end;
$$;

create or replace function public.apply_discover_feedback_v3(
  p_achievement_id uuid,
  p_action public.recommendation_action,
  p_operation_id uuid
)
returns table (liked boolean, like_count integer, previous_liked boolean, category_score integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_category public.achievement_category;
  v_owner_id uuid;
  v_previous_liked boolean;
  v_previous_action public.feed_action_type;
  v_previous_operation_id uuid;
  v_previous_weight integer := 0;
  v_next_weight integer := case p_action when 'like' then 3 when 'not_for_me' then -2 else -1 end;
  v_delta integer;
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

  select * into v_existing
  from public.recommendation_events
  where user_id = v_user_id and operation_id = p_operation_id;
  if found then
    select a.like_count into v_like_count from public.achievements a where a.id = v_existing.achievement_id;
    select coalesce(s.score, 0) into v_score from public.recommendation_category_scores s
    where s.user_id = v_user_id and s.category = v_existing.category;
    return query select exists (
      select 1 from public.likes l where l.user_id = v_user_id and l.achievement_id = v_existing.achievement_id
    ), coalesce(v_like_count, 0), v_existing.previous_liked, coalesce(v_score, 0);
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

  select f.action, f.operation_id into v_previous_action, v_previous_operation_id
  from public.feed_actions f
  where f.user_id = v_user_id and f.achievement_id = p_achievement_id
  for update;
  v_previous_weight := case v_previous_action
    when 'like' then 3
    when 'dislike' then -2
    when 'skip' then -1
    else 0
  end;
  v_delta := v_next_weight - v_previous_weight;
  select exists (
    select 1 from public.likes l where l.user_id = v_user_id and l.achievement_id = p_achievement_id
  ) into v_previous_liked;

  insert into public.feed_actions (user_id, achievement_id, action, operation_id, previous_liked)
  values (
    v_user_id, p_achievement_id,
    case when p_action = 'not_for_me' then 'dislike'::public.feed_action_type else p_action::text::public.feed_action_type end,
    p_operation_id, v_previous_liked
  ) on conflict (user_id, achievement_id) do update
    set action = excluded.action, operation_id = excluded.operation_id,
        previous_liked = excluded.previous_liked, updated_at = statement_timestamp();

  if p_action = 'like' then
    insert into public.likes (user_id, achievement_id) values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;
  elsif p_action = 'not_for_me' then
    delete from public.likes where user_id = v_user_id and achievement_id = p_achievement_id;
  end if;

  insert into public.recommendation_events (
    user_id, achievement_id, category, action, operation_id, score_delta,
    previous_liked, previous_action, previous_operation_id
  ) values (
    v_user_id, p_achievement_id, v_category, p_action, p_operation_id, v_delta,
    v_previous_liked, v_previous_action, v_previous_operation_id
  );
  insert into public.recommendation_category_scores (user_id, category, score)
  values (v_user_id, v_category, greatest(-100, least(100, v_delta)))
  on conflict (user_id, category) do update
    set score = greatest(-100, least(100, public.recommendation_category_scores.score + v_delta)),
        updated_at = statement_timestamp()
  returning score into v_score;
  select a.like_count into v_like_count from public.achievements a where a.id = p_achievement_id;
  return query select p_action = 'like', coalesce(v_like_count, 0), v_previous_liked, v_score;
end;
$$;

create or replace function public.undo_discover_feedback_v3(
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
  select * into v_event
  from public.recommendation_events
  where user_id = v_user_id and achievement_id = p_achievement_id and operation_id = p_operation_id
  for update;
  if not found then
    raise exception 'this feedback can no longer be undone' using errcode = 'P0001';
  end if;
  if v_event.undone_at is not null then
    select a.like_count into v_like_count from public.achievements a where a.id = p_achievement_id;
    select coalesce(s.score, 0) into v_score from public.recommendation_category_scores s
    where s.user_id = v_user_id and s.category = v_event.category;
    return query select exists (
      select 1 from public.likes l where l.user_id = v_user_id and l.achievement_id = p_achievement_id
    ), coalesce(v_like_count, 0), coalesce(v_score, 0);
    return;
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

  if v_event.previous_action is null then
    delete from public.feed_actions
    where user_id = v_user_id and achievement_id = p_achievement_id and operation_id = p_operation_id;
  else
    update public.feed_actions
    set action = v_event.previous_action,
        operation_id = v_event.previous_operation_id,
        previous_liked = v_event.previous_liked,
        updated_at = statement_timestamp()
    where user_id = v_user_id and achievement_id = p_achievement_id and operation_id = p_operation_id;
  end if;

  update public.recommendation_events set undone_at = statement_timestamp() where id = v_event.id;
  insert into public.recommendation_category_scores (user_id, category, score)
  values (v_user_id, v_event.category, greatest(-100, least(100, -v_event.score_delta)))
  on conflict (user_id, category) do update
    set score = greatest(-100, least(100, public.recommendation_category_scores.score - v_event.score_delta)),
        updated_at = statement_timestamp()
  returning score into v_score;
  select a.like_count into v_like_count from public.achievements a where a.id = p_achievement_id;
  return query select v_event.previous_liked, coalesce(v_like_count, 0), v_score;
end;
$$;

create or replace function public.get_recommendation_view_history_v1(
  p_limit integer default 30,
  p_before_viewed_at timestamptz default null,
  p_before_event_id uuid default null
)
returns table (
  event_id uuid,
  viewed_at timestamptz,
  achievement_id uuid,
  title text,
  category public.achievement_category,
  rarity public.achievement_rarity,
  achievement_date date,
  cover_key text,
  cover_url text,
  owner_id uuid,
  owner_username extensions.citext,
  owner_display_name text,
  owner_avatar_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 60);
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if (p_before_viewed_at is null) <> (p_before_event_id is null) then
    raise exception 'history cursor is incomplete' using errcode = '22023';
  end if;

  return query
  select
    event.id, event.created_at,
    a.id, a.title, a.category, a.rarity, a.achievement_date, a.cover_key, a.cover_url,
    p.id, p.username, p.display_name, p.avatar_key
  from public.recommendation_engagement_events event
  join public.achievements a on a.id = event.achievement_id
  join public.profiles p on p.id = a.owner_id
  where event.user_id = v_user_id
    and event.event_type = 'impression'
    and a.status = 'completed'
    and a.lifecycle_status = 'completed'
    and a.visibility = 'public'
    and a.hidden_at is null
    and a.revoked_at is null
    and a.moderation_status = 'active'
    and p.is_discoverable
    and not private.users_are_blocked(v_user_id, a.owner_id)
    and (
      p_before_viewed_at is null
      or (event.created_at, event.id) < (p_before_viewed_at, p_before_event_id)
    )
  order by event.created_at desc, event.id desc
  limit v_limit;
end;
$$;

revoke all on function public.start_discover_round_v2(text),
  public.get_discover_feed_v5(uuid, integer, integer, text),
  public.record_discover_engagement_v2(uuid, text, uuid, integer),
  public.apply_discover_feedback_v3(uuid, public.recommendation_action, uuid),
  public.undo_discover_feedback_v3(uuid, uuid),
  public.get_recommendation_view_history_v1(integer, timestamptz, uuid)
from public, anon;
grant execute on function public.start_discover_round_v2(text),
  public.get_discover_feed_v5(uuid, integer, integer, text),
  public.record_discover_engagement_v2(uuid, text, uuid, integer),
  public.apply_discover_feedback_v3(uuid, public.recommendation_action, uuid),
  public.undo_discover_feedback_v3(uuid, uuid),
  public.get_recommendation_view_history_v1(integer, timestamptz, uuid)
to authenticated;
