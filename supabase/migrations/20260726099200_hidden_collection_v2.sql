-- Contract follow-up: the normal collection RPC intentionally includes hidden
-- rows only when requested. A separate owner-only RPC prevents a hidden-only
-- screen from accidentally rendering the entire collection.
create or replace function public.get_hidden_collection_v2(
  p_lifecycle public.patch_lifecycle_status default null,
  p_category public.achievement_category default null,
  p_query text default null,
  p_sort text default 'newest',
  p_limit integer default 80
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
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 80), 1), 120);
  v_sort text := case when p_sort in ('newest', 'title', 'rarity') then p_sort else 'newest' end;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    a.id, a.owner_id, a.title, a.description, a.category, a.rarity, a.status,
    a.lifecycle_status, a.target_date, a.hidden_at, a.source_kind, a.source_key,
    a.revoked_at, a.moderation_status, a.visibility, a.achievement_date,
    a.cover_key, a.cover_url, a.like_count, a.created_at, a.completed_at,
    a.reveal_viewed_at, a.collection_viewed_at
  from public.achievements a
  where a.owner_id = auth.uid()
    and a.hidden_at is not null
    and (p_lifecycle is null or a.lifecycle_status = p_lifecycle)
    and (p_category is null or a.category = p_category)
    and a.revoked_at is null
    and (v_query is null or a.search_document @@ websearch_to_tsquery('simple', v_query))
  order by
    case when v_sort = 'title' then lower(a.title) end asc nulls last,
    case when v_sort = 'rarity' then case a.rarity::text when 'legendary' then 3 when 'rare' then 2 else 1 end end desc nulls last,
    a.created_at desc, a.id desc
  limit v_limit;
end;
$$;

revoke all on function public.get_hidden_collection_v2(public.patch_lifecycle_status, public.achievement_category, text, text, integer) from public, anon;
grant execute on function public.get_hidden_collection_v2(public.patch_lifecycle_status, public.achievement_category, text, text, integer) to authenticated;
