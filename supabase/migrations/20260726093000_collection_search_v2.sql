-- Owner collection search stays server scoped.  The document intentionally
-- includes active timeline text so a Patch can be found by an update, without
-- exposing another user's private history.
alter table public.achievements
  add column if not exists search_document tsvector not null default ''::tsvector;

create or replace function private.refresh_patch_search_document(p_patch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_text text;
begin
  select string_agg(concat_ws(' ', e.title, e.note, e.unit), ' ' order by e.event_date, e.created_at)
  into v_event_text
  from public.achievement_events e
  where e.achievement_id = p_patch_id
    and e.moderation_status = 'active';

  update public.achievements a
  set search_document =
    setweight(to_tsvector('simple', coalesce(a.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(a.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(v_event_text, '')), 'C')
  where a.id = p_patch_id;
end;
$$;

create or replace function private.refresh_achievement_search_document_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_patch_search_document(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_achievement_event_search_document_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_patch_search_document(coalesce(new.achievement_id, old.achievement_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists achievements_refresh_search_document on public.achievements;
create trigger achievements_refresh_search_document
after insert or update of title, description on public.achievements
for each row execute function private.refresh_achievement_search_document_trigger();

drop trigger if exists achievement_events_refresh_search_document on public.achievement_events;
create trigger achievement_events_refresh_search_document
after insert or update of title, note, unit, moderation_status or delete on public.achievement_events
for each row execute function private.refresh_achievement_event_search_document_trigger();

update public.achievements a
set search_document =
  setweight(to_tsvector('simple', coalesce(a.title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(a.description, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce((
    select string_agg(concat_ws(' ', e.title, e.note, e.unit), ' ' order by e.event_date, e.created_at)
    from public.achievement_events e
    where e.achievement_id = a.id and e.moderation_status = 'active'
  ), '')), 'C');

create index if not exists achievements_search_document_idx
  on public.achievements using gin (search_document);

alter table public.user_settings
  add column if not exists collection_view_mode text not null default 'list'
    check (collection_view_mode in ('list', 'grid')),
  add column if not exists profile_view_mode text not null default 'grid'
    check (profile_view_mode in ('list', 'grid'));

create or replace function public.get_collection_v2(
  p_lifecycle public.patch_lifecycle_status default null,
  p_category public.achievement_category default null,
  p_query text default null,
  p_sort text default 'newest',
  p_include_hidden boolean default false,
  p_limit integer default 80
)
returns table (
  id uuid,
  owner_id uuid,
  title text,
  description text,
  category public.achievement_category,
  rarity public.achievement_rarity,
  status public.achievement_status,
  lifecycle_status public.patch_lifecycle_status,
  target_date date,
  hidden_at timestamptz,
  source_kind public.achievement_source_kind,
  source_key text,
  revoked_at timestamptz,
  moderation_status public.moderation_status,
  visibility public.achievement_visibility,
  achievement_date date,
  cover_key text,
  cover_url text,
  like_count integer,
  created_at timestamptz,
  completed_at timestamptz,
  reveal_viewed_at timestamptz,
  collection_viewed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
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
    and (p_lifecycle is null or a.lifecycle_status = p_lifecycle)
    and (p_category is null or a.category = p_category)
    and (p_include_hidden or a.hidden_at is null)
    and a.revoked_at is null
    and (v_query is null or a.search_document @@ websearch_to_tsquery('simple', v_query))
  order by
    case when v_sort = 'title' then lower(a.title) end asc nulls last,
    case when v_sort = 'rarity' then case a.rarity::text when 'legendary' then 3 when 'epic' then 2 when 'rare' then 2 else 1 end end desc nulls last,
    a.created_at desc,
    a.id desc
  limit v_limit;
end;
$$;

revoke all on function public.get_collection_v2(public.patch_lifecycle_status, public.achievement_category, text, text, boolean, integer) from public, anon;
grant execute on function public.get_collection_v2(public.patch_lifecycle_status, public.achievement_category, text, text, boolean, integer) to authenticated;
revoke all on function private.refresh_patch_search_document(uuid) from public, anon, authenticated;
revoke all on function private.refresh_achievement_search_document_trigger() from public, anon, authenticated;
revoke all on function private.refresh_achievement_event_search_document_trigger() from public, anon, authenticated;
