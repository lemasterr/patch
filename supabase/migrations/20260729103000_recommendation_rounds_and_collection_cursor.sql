-- Discover keeps a materialized, per-user round. Ranking can evolve between
-- rounds, but paging through one round never reshuffles or repeats cards.
create table public.recommendation_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  closed_at timestamptz
);

create index recommendation_rounds_active_idx
  on public.recommendation_rounds (user_id, created_at desc)
  where closed_at is null;

create table public.recommendation_round_items (
  round_id uuid not null references public.recommendation_rounds(id) on delete cascade,
  rank integer not null check (rank > 0),
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, achievement_id),
  unique (round_id, rank)
);

create index recommendation_round_items_page_idx
  on public.recommendation_round_items (round_id, rank);

-- Preferences are deliberately compact: they hold only IDs and numerical
-- weights, never Patch text or profile content.
create table public.recommendation_author_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null default 0 check (score between -100 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, author_id),
  check (user_id <> author_id)
);

create table public.recommendation_engagement_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category public.achievement_category not null,
  event_type text not null check (event_type in ('profile_open', 'view')),
  duration_ms integer,
  operation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create index recommendation_engagement_events_user_created_idx
  on public.recommendation_engagement_events (user_id, created_at desc);

alter table public.recommendation_rounds enable row level security;
alter table public.recommendation_round_items enable row level security;
alter table public.recommendation_author_scores enable row level security;
alter table public.recommendation_engagement_events enable row level security;

create policy "recommendation_rounds_read_own"
on public.recommendation_rounds for select to authenticated
using (user_id = auth.uid());
create policy "recommendation_round_items_read_own"
on public.recommendation_round_items for select to authenticated
using (exists (
  select 1 from public.recommendation_rounds r
  where r.id = round_id and r.user_id = auth.uid()
));
create policy "recommendation_author_scores_read_own"
on public.recommendation_author_scores for select to authenticated
using (user_id = auth.uid());
create policy "recommendation_engagement_events_read_own"
on public.recommendation_engagement_events for select to authenticated
using (user_id = auth.uid());

revoke all on public.recommendation_rounds, public.recommendation_round_items,
  public.recommendation_author_scores, public.recommendation_engagement_events
from public, anon, authenticated;
grant select on public.recommendation_rounds, public.recommendation_round_items,
  public.recommendation_author_scores, public.recommendation_engagement_events
to authenticated;

create or replace function public.get_discover_feed_v4(
  p_round_id uuid default null,
  p_limit integer default 24,
  p_after_rank integer default 0
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
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 40);
  v_after_rank integer := greatest(coalesce(p_after_rank, 0), 0);
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_round_id is not null then
    select r.id into v_round_id
    from public.recommendation_rounds r
    where r.id = p_round_id and r.user_id = v_user_id;
    if not found then
      raise exception 'recommendation round is unavailable' using errcode = '42501';
    end if;
  else
    update public.recommendation_rounds r
    set closed_at = now()
    where r.user_id = v_user_id
      and r.closed_at is null
      and r.expires_at <= now();

    select r.id into v_round_id
    from public.recommendation_rounds r
    where r.user_id = v_user_id and r.closed_at is null
    order by r.created_at desc
    limit 1;

    if v_round_id is null then
      insert into public.recommendation_rounds (user_id)
      values (v_user_id)
      returning recommendation_rounds.id into v_round_id;

      -- Seven relevant positions plus three exploratory positions make a
      -- 70/30 mix. Diversity is evaluated first, so an author or category is
      -- never repeated consecutively while another candidate is available.
      insert into public.recommendation_round_items (round_id, rank, achievement_id)
      with recursive raw_candidates as (
        select
          a.id as achievement_id,
          a.owner_id,
          a.category,
          (
            coalesce(category_score.score, 0) * 10
            + coalesce(author_score.score, 0) * 8
            + least(a.like_count, 100)
          )::bigint as relevance_score,
          hashtextextended(a.id::text || v_round_id::text, 0) as exploration_score
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
      ),
      candidate_pool as (
        (select * from raw_candidates
          order by relevance_score desc, exploration_score desc, achievement_id
          limit 350)
        union
        (select * from raw_candidates
          order by exploration_score desc, achievement_id
          limit 150)
      ),
      sequence (rank, achievement_id, owner_id, category, seen_ids) as (
        (
          select
            1,
            candidate_pool.achievement_id,
            candidate_pool.owner_id,
            candidate_pool.category,
            array[candidate_pool.achievement_id]::uuid[]
          from candidate_pool
          order by relevance_score desc, exploration_score desc, achievement_id
          limit 1
        )
        union all
        select
          sequence.rank + 1,
          candidate.achievement_id,
          candidate.owner_id,
          candidate.category,
          sequence.seen_ids || candidate.achievement_id
        from sequence
        cross join lateral (
          select pool.*
          from candidate_pool pool
          where not (pool.achievement_id = any(sequence.seen_ids))
          order by
            case
              when pool.category = sequence.category
                or pool.owner_id = sequence.owner_id then 1
              else 0
            end,
            case
              when (sequence.rank + 1) % 10 in (3, 6, 9)
                then pool.exploration_score
              else pool.relevance_score
            end desc,
            pool.achievement_id
          limit 1
        ) candidate
        where sequence.rank < 500
      )
      select v_round_id, sequence.rank, sequence.achievement_id
      from sequence;
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
    and not exists (
      select 1 from public.feed_actions f
      where f.user_id = v_user_id and f.achievement_id = item.achievement_id
    )
  order by item.rank
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
  v_category_delta integer := case p_action
    when 'like' then 3
    when 'not_for_me' then -2
    else -1
  end;
  v_author_delta integer := case p_action
    when 'like' then 3
    when 'not_for_me' then -2
    else -1
  end;
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
    select a.like_count into v_like_count
    from public.achievements a where a.id = v_existing.achievement_id;
    select coalesce(s.score, 0) into v_score
    from public.recommendation_category_scores s
    where s.user_id = v_user_id and s.category = v_existing.category;
    return query select v_existing.action = 'like', coalesce(v_like_count, 0),
      v_existing.previous_liked, coalesce(v_score, 0);
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
    select 1 from public.likes l
    where l.user_id = v_user_id and l.achievement_id = p_achievement_id
  ) into v_previous_liked;

  insert into public.feed_actions (user_id, achievement_id, action, operation_id, previous_liked)
  values (
    v_user_id,
    p_achievement_id,
    case when p_action = 'not_for_me' then 'dislike'::public.feed_action_type
      else p_action::text::public.feed_action_type end,
    p_operation_id,
    v_previous_liked
  )
  on conflict (user_id, achievement_id) do update
    set action = excluded.action,
        operation_id = excluded.operation_id,
        previous_liked = excluded.previous_liked,
        updated_at = now();

  if p_action = 'like' then
    insert into public.likes (user_id, achievement_id)
    values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;
  elsif p_action = 'not_for_me' then
    delete from public.likes
    where user_id = v_user_id and achievement_id = p_achievement_id;
  end if;

  insert into public.recommendation_events (
    user_id, achievement_id, category, action, operation_id, score_delta, previous_liked
  ) values (
    v_user_id, p_achievement_id, v_category, p_action, p_operation_id,
    v_category_delta, v_previous_liked
  );

  insert into public.recommendation_category_scores (user_id, category, score)
  values (v_user_id, v_category, greatest(-100, least(100, v_category_delta)))
  on conflict (user_id, category) do update
    set score = greatest(-100, least(100,
          public.recommendation_category_scores.score + v_category_delta)),
        updated_at = now()
  returning score into v_score;

  insert into public.recommendation_author_scores (user_id, author_id, score)
  values (v_user_id, v_owner_id, greatest(-100, least(100, v_author_delta)))
  on conflict (user_id, author_id) do update
    set score = greatest(-100, least(100,
          public.recommendation_author_scores.score + v_author_delta)),
        updated_at = now();

  select a.like_count into v_like_count
  from public.achievements a where a.id = p_achievement_id;
  return query select p_action = 'like', coalesce(v_like_count, 0),
    v_previous_liked, v_score;
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
  v_owner_id uuid;
  v_author_delta integer;
  v_like_count integer;
  v_score integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  select * into v_event
  from public.recommendation_events
  where user_id = v_user_id
    and achievement_id = p_achievement_id
    and operation_id = p_operation_id
  for update;
  if not found then
    raise exception 'this feedback can no longer be undone' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.feed_actions f
    where f.user_id = v_user_id
      and f.achievement_id = p_achievement_id
      and f.operation_id = p_operation_id
  ) then
    raise exception 'this feedback has been superseded' using errcode = 'P0001';
  end if;

  select a.owner_id into v_owner_id
  from public.achievements a where a.id = p_achievement_id;
  v_author_delta := case v_event.action
    when 'like' then 3
    when 'not_for_me' then -2
    else -1
  end;

  if v_event.previous_liked then
    insert into public.likes (user_id, achievement_id)
    values (v_user_id, p_achievement_id)
    on conflict (user_id, achievement_id) do nothing;
  elsif v_event.action in ('like', 'not_for_me') then
    delete from public.likes
    where user_id = v_user_id and achievement_id = p_achievement_id;
  end if;

  delete from public.feed_actions
  where user_id = v_user_id
    and achievement_id = p_achievement_id
    and operation_id = p_operation_id;
  delete from public.recommendation_events where id = v_event.id;

  insert into public.recommendation_category_scores (user_id, category, score)
  values (v_user_id, v_event.category, greatest(-100, least(100, -v_event.score_delta)))
  on conflict (user_id, category) do update
    set score = greatest(-100, least(100,
          public.recommendation_category_scores.score - v_event.score_delta)),
        updated_at = now()
  returning score into v_score;

  if v_owner_id is not null then
    insert into public.recommendation_author_scores (user_id, author_id, score)
    values (v_user_id, v_owner_id, greatest(-100, least(100, -v_author_delta)))
    on conflict (user_id, author_id) do update
      set score = greatest(-100, least(100,
            public.recommendation_author_scores.score - v_author_delta)),
          updated_at = now();
  end if;

  select a.like_count into v_like_count
  from public.achievements a where a.id = p_achievement_id;
  return query select v_event.previous_liked, coalesce(v_like_count, 0), v_score;
end;
$$;

create or replace function public.record_discover_engagement_v1(
  p_achievement_id uuid,
  p_event_type text,
  p_duration_ms integer default null,
  p_operation_id uuid default null
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
  v_duration integer := least(greatest(coalesce(p_duration_ms, 0), 0), 600000);
  v_category_delta integer;
  v_author_delta integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_event_type not in ('profile_open', 'view') or p_operation_id is null then
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

  insert into public.recommendation_engagement_events (
    user_id, achievement_id, owner_id, category, event_type, duration_ms, operation_id
  ) values (
    v_user_id, p_achievement_id, v_owner_id, v_category, p_event_type,
    case when p_event_type = 'view' then v_duration else null end, p_operation_id
  ) on conflict (user_id, operation_id) do nothing;
  if not found then return; end if;

  insert into public.recommendation_category_scores (user_id, category, score)
  values (v_user_id, v_category, greatest(-100, least(100, v_category_delta)))
  on conflict (user_id, category) do update
    set score = greatest(-100, least(100,
          public.recommendation_category_scores.score + v_category_delta)),
        updated_at = now();

  insert into public.recommendation_author_scores (user_id, author_id, score)
  values (v_user_id, v_owner_id, greatest(-100, least(100, v_author_delta)))
  on conflict (user_id, author_id) do update
    set score = greatest(-100, least(100,
          public.recommendation_author_scores.score + v_author_delta)),
        updated_at = now();
end;
$$;

create or replace function public.reset_discover_round()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  update public.recommendation_rounds
  set closed_at = now()
  where user_id = auth.uid() and closed_at is null;
  delete from public.feed_actions where user_id = auth.uid();
end;
$$;

-- A collection is owner-scoped, but it still needs real keyset pagination so
-- that a large library is not transferred just to render its first screen.
create or replace function public.get_collection_v3(
  p_lifecycle public.patch_lifecycle_status default null,
  p_category public.achievement_category default null,
  p_query text default null,
  p_sort text default 'newest',
  p_include_hidden boolean default false,
  p_hidden_only boolean default false,
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_before_title text default null,
  p_before_rarity_rank integer default null
)
returns table (
  id uuid, owner_id uuid, title text, description text,
  category public.achievement_category, rarity public.achievement_rarity,
  status public.achievement_status, lifecycle_status public.patch_lifecycle_status,
  target_date date, hidden_at timestamptz, source_kind public.achievement_source_kind,
  source_key text, revoked_at timestamptz, moderation_status public.moderation_status,
  visibility public.achievement_visibility, achievement_date date, cover_key text,
  cover_url text, like_count integer, created_at timestamptz, completed_at timestamptz,
  reveal_viewed_at timestamptz, collection_viewed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_sort text := case when p_sort in ('newest', 'title', 'rarity') then p_sort else 'newest' end;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'both collection cursor fields are required' using errcode = '22023';
  end if;
  if v_sort = 'title' and p_before_created_at is not null and p_before_title is null then
    raise exception 'a title cursor is required for title sorting' using errcode = '22023';
  end if;
  if v_sort = 'rarity' and p_before_created_at is not null and p_before_rarity_rank is null then
    raise exception 'a rarity cursor is required for rarity sorting' using errcode = '22023';
  end if;

  return query
  with source as (
    select
      a.*,
      case a.rarity::text when 'legendary' then 3 when 'rare' then 2 else 1 end
        as rarity_rank
    from public.achievements a
    where a.owner_id = auth.uid()
      and (p_lifecycle is null or a.lifecycle_status = p_lifecycle)
      and (p_category is null or a.category = p_category)
      and (p_hidden_only or p_include_hidden or a.hidden_at is null)
      and (not p_hidden_only or a.hidden_at is not null)
      and a.revoked_at is null
      and (v_query is null or a.search_document @@ websearch_to_tsquery('simple', v_query))
  )
  select
    a.id, a.owner_id, a.title, a.description, a.category, a.rarity, a.status,
    a.lifecycle_status, a.target_date, a.hidden_at, a.source_kind, a.source_key,
    a.revoked_at, a.moderation_status, a.visibility, a.achievement_date,
    a.cover_key, a.cover_url, a.like_count, a.created_at, a.completed_at,
    a.reveal_viewed_at, a.collection_viewed_at
  from source a
  where p_before_created_at is null
    or (
      v_sort = 'newest'
      and (a.created_at, a.id) < (p_before_created_at, p_before_id)
    )
    or (
      v_sort = 'title'
      and (
        lower(a.title) > lower(p_before_title)
        or (
          lower(a.title) = lower(p_before_title)
          and (a.created_at, a.id) < (p_before_created_at, p_before_id)
        )
      )
    )
    or (
      v_sort = 'rarity'
      and (
        a.rarity_rank < p_before_rarity_rank
        or (
          a.rarity_rank = p_before_rarity_rank
          and (a.created_at, a.id) < (p_before_created_at, p_before_id)
        )
      )
    )
  order by
    case when v_sort = 'title' then lower(a.title) end asc nulls last,
    case when v_sort = 'rarity' then a.rarity_rank end desc nulls last,
    a.created_at desc,
    a.id desc
  limit v_limit;
end;
$$;

revoke all on function public.get_discover_feed_v4(uuid, integer, integer),
  public.record_discover_engagement_v1(uuid, text, integer, uuid),
  public.get_collection_v3(public.patch_lifecycle_status, public.achievement_category,
    text, text, boolean, boolean, integer, timestamptz, uuid, text, integer)
from public, anon;

grant execute on function public.get_discover_feed_v4(uuid, integer, integer),
  public.record_discover_engagement_v1(uuid, text, integer, uuid),
  public.get_collection_v3(public.patch_lifecycle_status, public.achievement_category,
    text, text, boolean, boolean, integer, timestamptz, uuid, text, integer)
to authenticated;
