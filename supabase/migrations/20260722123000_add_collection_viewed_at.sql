-- Collection viewing is distinct from revealing a completed Patch. Existing
-- rows predate the Collection "New" badge, so they start as already viewed;
-- rows created after this migration intentionally retain the NULL default.
alter table public.achievements
  add column collection_viewed_at timestamptz;

update public.achievements
set collection_viewed_at = coalesce(completed_at, created_at, now())
where collection_viewed_at is null;

grant update (collection_viewed_at)
on public.achievements to authenticated;
