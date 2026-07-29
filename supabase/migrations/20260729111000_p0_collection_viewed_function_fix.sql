-- Keep the P0 migration immutable after local application. Qualifying the
-- table alias prevents the OUT parameter from shadowing the stored column.
create or replace function public.mark_patch_collection_viewed(
  p_patch_id uuid
)
returns table (id uuid, collection_viewed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare v_patch public.achievements%rowtype;
begin
  select * into v_patch from private.assert_patch_owner(p_patch_id);
  update public.achievements as patch
  set collection_viewed_at = coalesce(patch.collection_viewed_at, now())
  where patch.id = v_patch.id
  returning patch.id, patch.collection_viewed_at into id, collection_viewed_at;
  return next;
end;
$$;
