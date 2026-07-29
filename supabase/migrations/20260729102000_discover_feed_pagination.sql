-- Cursor-like, ranked feed paging. The offset is scoped to the stable order
-- for one request round and avoids cutting the discover deck off after its
-- first 16 cards.
create or replace function public.get_discover_feed_v3(
  p_limit integer default 24,
  p_offset integer default 0
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
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10_000);
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  return query
  select
    a.id, a.owner_id, a.title, a.description, a.category, a.rarity,
    a.status, a.visibility, a.achievement_date, a.cover_key, a.cover_url,
    a.like_count, a.created_at, a.completed_at, a.reveal_viewed_at,
    a.lifecycle_status, p.username, p.display_name, p.avatar_key
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
    hashtextextended(a.id::text || current_date::text, 0) desc,
    a.created_at desc,
    a.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.get_discover_feed_v3(integer, integer) from public, anon;
grant execute on function public.get_discover_feed_v3(integer, integer) to authenticated;
