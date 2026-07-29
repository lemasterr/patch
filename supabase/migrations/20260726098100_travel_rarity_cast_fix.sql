-- The original expand migration is already applied locally.  Recreate its
-- reconciliation function with the explicit enum cast required by Postgres.
create or replace function private.reconcile_world_patches(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer; v_threshold integer; v_region text;
begin
  insert into public.achievements (owner_id, title, description, category, achievement_date, visibility, rarity, status, lifecycle_status, source_kind, source_key, idempotency_key, cover_key, image_provider, completed_at, revoked_at)
  select p_user_id, 'Visited ' || v.country_name, 'Added ' || v.country_name || ' to your Patch world.', 'travel', coalesce(v.visited_at, current_date), 'private', 'common', 'completed', 'completed', 'country', 'country:' || v.country_code, md5(p_user_id::text || ':country:' || v.country_code)::uuid, 'country-' || lower(v.country_code), 'local-pixel', now(), null
  from public.visited_countries v join public.country_catalog c on c.country_code = v.country_code
  where v.user_id = p_user_id and v.status in ('visited', 'lived')
  on conflict (owner_id, idempotency_key) do update set
    title = excluded.title,
    description = case when public.achievements.description_overridden then public.achievements.description else excluded.description end,
    achievement_date = case when public.achievements.date_overridden then public.achievements.achievement_date else excluded.achievement_date end,
    cover_key = excluded.cover_key, lifecycle_status = 'completed', revoked_at = null,
    completed_at = coalesce(public.achievements.completed_at, now());

  select count(*)::integer into v_count from public.visited_countries v join public.country_catalog c on c.country_code = v.country_code where v.user_id = p_user_id and v.status in ('visited', 'lived') and c.counts_toward_milestones;
  for v_threshold in 5..195 by 5 loop
    exit when v_threshold > v_count;
    insert into public.achievements (owner_id, title, description, category, achievement_date, visibility, rarity, status, lifecycle_status, source_kind, source_key, idempotency_key, cover_key, image_provider, completed_at, revoked_at)
    values (p_user_id, 'Explored ' || v_threshold || ' countries', 'Your Patch world now includes ' || v_threshold || ' countries.', 'travel', current_date, 'private', (case when v_threshold >= 100 then 'legendary' when v_threshold >= 50 then 'rare' else 'common' end)::public.achievement_rarity, 'completed', 'completed', 'country_milestone', 'country_milestone:' || v_threshold, md5(p_user_id::text || ':country-milestone:' || v_threshold)::uuid, 'country-milestone-' || v_threshold, 'local-pixel', now(), null)
    on conflict (owner_id, idempotency_key) do update set
      title = excluded.title,
      description = case when public.achievements.description_overridden then public.achievements.description else excluded.description end,
      achievement_date = case when public.achievements.date_overridden then public.achievements.achievement_date else excluded.achievement_date end,
      rarity = excluded.rarity, lifecycle_status = 'completed', revoked_at = null,
      completed_at = coalesce(public.achievements.completed_at, now());
  end loop;

  for v_region in select distinct region from public.country_catalog loop
    if not exists (select 1 from public.country_catalog c where c.region = v_region and c.counts_toward_milestones and not exists (select 1 from public.visited_countries v where v.user_id = p_user_id and v.country_code = c.country_code and v.status in ('visited', 'lived'))) then
      insert into public.achievements (owner_id, title, description, category, achievement_date, visibility, rarity, status, lifecycle_status, source_kind, source_key, idempotency_key, cover_key, image_provider, completed_at, revoked_at)
      values (p_user_id, 'Completed ' || initcap(v_region), 'You explored every country in ' || initcap(v_region) || '.', 'travel', current_date, 'private', 'legendary', 'completed', 'completed', 'continent', 'continent:' || v_region, md5(p_user_id::text || ':continent:' || v_region)::uuid, 'continent-' || v_region, 'local-pixel', now(), null)
      on conflict (owner_id, idempotency_key) do update set lifecycle_status = 'completed', revoked_at = null, completed_at = coalesce(public.achievements.completed_at, now());
    end if;
  end loop;

  update public.achievements a set revoked_at = coalesce(a.revoked_at, now()), lifecycle_status = 'locked'
  where a.owner_id = p_user_id and a.source_kind in ('country', 'country_milestone', 'continent') and (
    (a.source_kind = 'country' and not exists (select 1 from public.visited_countries v where v.user_id = p_user_id and v.status in ('visited', 'lived') and a.source_key = 'country:' || v.country_code))
    or (a.source_kind = 'country_milestone' and split_part(a.source_key, ':', 2)::integer > v_count)
    or (a.source_kind = 'continent' and exists (select 1 from public.country_catalog c where c.region = split_part(a.source_key, ':', 2) and c.counts_toward_milestones and not exists (select 1 from public.visited_countries v where v.user_id = p_user_id and v.country_code = c.country_code and v.status in ('visited', 'lived'))))
  );
end;
$$;
