create or replace function private.sync_country_achievements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
  v_country_code text := coalesce(new.country_code, old.country_code);
  v_country_name text := coalesce(new.country_name, old.country_name, v_country_code);
  v_country_key uuid := md5(v_user_id::text || ':country:' || v_country_code)::uuid;
  v_total_key uuid := md5(v_user_id::text || ':country-count')::uuid;
  v_count integer;
  v_rarity public.achievement_rarity;
  v_country_achievement_id uuid;
begin
  if tg_op <> 'DELETE' and new.status in ('visited', 'lived') then
    select id into v_country_achievement_id
    from public.achievements
    where owner_id = v_user_id and idempotency_key = v_country_key;

    insert into public.achievements (
      owner_id, title, description, category, achievement_date, visibility,
      rarity, status, idempotency_key, cover_key, image_provider, completed_at
    ) values (
      v_user_id,
      'Visited ' || v_country_name,
      'Added ' || v_country_name || ' to your Patch world.',
      'travel',
      coalesce(new.visited_at, current_date),
      'private',
      'uncommon',
      'completed',
      v_country_key,
      'country-' || lower(v_country_code),
      'local-pixel',
      now()
    )
    on conflict (owner_id, idempotency_key) do update
      set title = excluded.title,
          description = excluded.description,
          achievement_date = excluded.achievement_date,
          cover_key = excluded.cover_key;

    if v_country_achievement_id is null then
      insert into public.notifications (
        owner_id, type, achievement_id, title, body, link, dedupe_key
      )
      select
        v_user_id,
        'achievement_completed',
        a.id,
        'New country unlocked',
        v_country_name || ' is now part of your Patch world.',
        '/achievements/' || a.id::text,
        'country-unlocked:' || v_country_code
      from public.achievements a
      where a.owner_id = v_user_id and a.idempotency_key = v_country_key
      on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;

  select count(*)::integer into v_count
  from public.visited_countries
  where user_id = v_user_id and status in ('visited', 'lived');

  v_rarity := case
    when v_count >= 100 then 'legendary'
    when v_count >= 50 then 'epic'
    when v_count >= 20 then 'rare'
    when v_count >= 5 then 'uncommon'
    else 'common'
  end;

  if v_count > 0 or exists (
    select 1 from public.achievements
    where owner_id = v_user_id and idempotency_key = v_total_key
  ) then
    insert into public.achievements (
      owner_id, title, description, category, achievement_date, visibility,
      rarity, status, idempotency_key, cover_key, image_provider, completed_at
    ) values (
      v_user_id,
      'Explored ' || v_count || case when v_count = 1 then ' country' else ' countries' end,
      'Your Patch world currently includes ' || v_count || case when v_count = 1 then ' country.' else ' countries.' end,
      'travel',
      current_date,
      'private',
      v_rarity,
      'completed',
      v_total_key,
      'world-count-' || greatest(v_count, 1)::text,
      'local-pixel',
      now()
    )
    on conflict (owner_id, idempotency_key) do update
      set title = excluded.title,
          description = excluded.description,
          achievement_date = excluded.achievement_date,
          rarity = excluded.rarity,
          cover_key = excluded.cover_key;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.sync_country_achievements() from public, anon, authenticated;
