-- A Discover round is a paging snapshot, not the owner of a person's
-- preference history. Advancing it must never resurrect a liked or
-- "not for me" Patch by deleting feed_actions.

create table public.recommendation_impressions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  first_seen_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  view_count integer not null default 1 check (view_count > 0),
  last_round_id uuid references public.recommendation_rounds(id) on delete set null,
  primary key (user_id, achievement_id)
);

create index recommendation_impressions_user_last_seen_idx
  on public.recommendation_impressions (user_id, last_seen_at desc);

alter table public.recommendation_impressions enable row level security;

create policy "recommendation_impressions_read_own"
on public.recommendation_impressions for select to authenticated
using (user_id = auth.uid());

revoke all on table public.recommendation_impressions
from public, anon, authenticated;
grant select on table public.recommendation_impressions to authenticated;

create or replace function public.advance_discover_round_v1()
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
  set closed_at = statement_timestamp()
  where user_id = auth.uid()
    and closed_at is null;
end;
$$;

-- Keep existing released clients safe while moving new code to the explicit
-- "advance" name. The prior implementation deleted durable feedback here.
create or replace function public.reset_discover_round()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.advance_discover_round_v1();
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
  v_round_id uuid;
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
  if not found then
    return;
  end if;

  if p_event_type = 'view' then
    select round_item.round_id into v_round_id
    from public.recommendation_round_items round_item
    join public.recommendation_rounds round_state on round_state.id = round_item.round_id
    where round_state.user_id = v_user_id
      and round_state.closed_at is null
      and round_item.achievement_id = p_achievement_id
    order by round_state.created_at desc
    limit 1;

    insert into public.recommendation_impressions (
      user_id, achievement_id, last_round_id
    ) values (
      v_user_id, p_achievement_id, v_round_id
    ) on conflict (user_id, achievement_id) do update
      set last_seen_at = statement_timestamp(),
          view_count = public.recommendation_impressions.view_count + 1,
          last_round_id = coalesce(
            excluded.last_round_id,
            public.recommendation_impressions.last_round_id
          );
  end if;

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

revoke all on function public.advance_discover_round_v1(),
  public.reset_discover_round(),
  public.record_discover_engagement_v1(uuid, text, integer, uuid)
from public, anon;
grant execute on function public.advance_discover_round_v1(),
  public.reset_discover_round(),
  public.record_discover_engagement_v1(uuid, text, integer, uuid)
to authenticated;
