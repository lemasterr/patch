-- Contract rollout. All supported mobile/Edge callers use v2 APIs before this
-- migration: coordinates and pre-v2 rarity values are now physically removed.
drop function if exists public.get_discover_feed(integer, timestamptz, uuid);
drop function if exists public.get_discover_feed_v2(integer);
drop function if exists public.get_friend_feed_v2(integer);
drop function if exists public.get_collection_v2(public.patch_lifecycle_status, public.achievement_category, text, text, boolean, integer);
drop function if exists public.create_patch_v2(text, text, public.achievement_category, public.achievement_rarity, public.achievement_visibility, public.patch_lifecycle_status, date, date, uuid);
drop function if exists public.update_user_patch(uuid, text, text, public.achievement_category, public.achievement_rarity, public.achievement_visibility, date, date, uuid);
drop function if exists public.claim_achievement_generation_jobs(integer, text, integer);
drop function if exists public.claim_next_achievement_generation_job();
drop function if exists public.create_achievement_for_generation(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, double precision, double precision, text[], uuid);

alter table public.achievements alter column rarity drop default;
alter type public.achievement_rarity rename to achievement_rarity_legacy;
create type public.achievement_rarity as enum ('common', 'rare', 'legendary');
alter table public.achievements
  alter column rarity type public.achievement_rarity
  using (
    case rarity::text
      when 'uncommon' then 'common'
      when 'epic' then 'rare'
      else rarity::text
    end
  )::public.achievement_rarity;

alter table public.achievements
  drop column location_text,
  drop column location_latitude,
  drop column location_longitude;
drop type public.achievement_rarity_legacy;

create or replace function public.create_patch_v2(p_title text, p_description text, p_category public.achievement_category, p_rarity public.achievement_rarity, p_visibility public.achievement_visibility, p_lifecycle_status public.patch_lifecycle_status, p_event_date date, p_target_date date, p_operation_id uuid)
returns table (achievement_id uuid, job_id uuid, lifecycle_status public.patch_lifecycle_status, generation_status public.achievement_status, was_existing boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_patch public.achievements%rowtype; v_job_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  if p_operation_id is null or char_length(trim(coalesce(p_title, ''))) not between 2 and 80 or char_length(trim(coalesce(p_description, ''))) not between 2 and 600 or p_event_date is null or p_event_date > current_date then raise exception 'Patch fields are invalid' using errcode = 'check_violation'; end if;
  if p_lifecycle_status = 'locked' and p_target_date is not null and p_target_date < p_event_date then raise exception 'target date cannot precede the Patch date' using errcode = 'check_violation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select * into v_patch from public.achievements where owner_id = v_user_id and idempotency_key = p_operation_id;
  if found then
    select id into v_job_id from public.achievement_generation_jobs where achievement_id = v_patch.id order by created_at desc limit 1;
    return query select v_patch.id, v_job_id, v_patch.lifecycle_status, v_patch.status, true; return;
  end if;
  insert into public.achievements (owner_id, title, description, category, achievement_date, target_date, visibility, rarity, lifecycle_status, source_kind, status, idempotency_key)
  values (v_user_id, trim(p_title), trim(p_description), p_category, p_event_date, case when p_lifecycle_status = 'locked' then p_target_date else null end, p_visibility, p_rarity, p_lifecycle_status, 'user', case when p_lifecycle_status = 'completed' then 'processing'::public.achievement_status else 'draft'::public.achievement_status end, p_operation_id)
  returning * into v_patch;
  insert into public.achievement_events (achievement_id, owner_id, operation_id, kind, event_date, title, note) values (v_patch.id, v_user_id, p_operation_id, 'created', p_event_date, v_patch.title, v_patch.description);
  v_job_id := private.create_generation_job_if_needed(v_patch);
  select * into v_patch from public.achievements where id = v_patch.id;
  return query select v_patch.id, v_job_id, v_patch.lifecycle_status, v_patch.status, false;
end;
$$;

create or replace function public.update_user_patch(p_patch_id uuid, p_title text, p_description text, p_category public.achievement_category, p_rarity public.achievement_rarity, p_visibility public.achievement_visibility, p_event_date date, p_target_date date, p_operation_id uuid)
returns public.achievements
language plpgsql security definer set search_path = ''
as $$
declare v_patch public.achievements%rowtype;
begin
  if auth.uid() is null or p_operation_id is null or char_length(trim(coalesce(p_title, ''))) not between 2 and 80 or char_length(trim(coalesce(p_description, ''))) not between 2 and 600 or p_event_date is null then raise exception 'Patch fields are invalid' using errcode = 'check_violation'; end if;
  select * into v_patch from private.assert_patch_owner(p_patch_id);
  update public.achievements set title = trim(p_title), description = trim(p_description), category = p_category, rarity = p_rarity, visibility = p_visibility, achievement_date = p_event_date, target_date = case when lifecycle_status = 'locked' then p_target_date else target_date end where id = v_patch.id returning * into v_patch;
  return v_patch;
end;
$$;

create or replace function public.claim_achievement_generation_jobs(p_limit integer default 1, p_worker_id text default 'unknown-worker', p_lease_seconds integer default 90)
returns table (job_id uuid, achievement_id uuid, owner_id uuid, attempt integer, lease_token uuid, lease_expires_at timestamptz, title text, category public.achievement_category, rarity public.achievement_rarity, idempotency_key uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 12); v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 90), 15), 600);
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = 'insufficient_privilege'; end if;
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 100 then raise exception 'worker id is invalid' using errcode = 'check_violation'; end if;
  return query with candidates as (select j.id from public.achievement_generation_jobs j where ((j.status = 'queued' and j.available_at <= now()) or (j.status = 'running' and j.lease_expires_at <= now())) and j.attempt < 5 order by case when j.status = 'running' then 0 else 1 end, j.available_at, j.created_at limit v_limit for update skip locked), claimed as (update public.achievement_generation_jobs j set status = 'running', attempt = j.attempt + 1, started_at = coalesce(j.started_at, now()), finished_at = null, error_message = null, lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => v_lease_seconds), heartbeat_at = now(), worker_id = trim(p_worker_id) from candidates c where j.id = c.id returning j.*) select c.id, c.achievement_id, c.owner_id, c.attempt, c.lease_token, c.lease_expires_at, a.title, a.category, a.rarity, a.idempotency_key from claimed c join public.achievements a on a.id = c.achievement_id;
end;
$$;

create or replace function public.get_discover_feed_v2(p_limit integer default 24)
returns table (id uuid, owner_id uuid, title text, description text, category public.achievement_category, rarity public.achievement_rarity, status public.achievement_status, visibility public.achievement_visibility, achievement_date date, cover_key text, cover_url text, like_count integer, created_at timestamptz, completed_at timestamptz, reveal_viewed_at timestamptz, lifecycle_status public.patch_lifecycle_status, owner_username extensions.citext, owner_display_name text, owner_avatar_key text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  return query select a.id, a.owner_id, a.title, a.description, a.category, a.rarity, a.status, a.visibility, a.achievement_date, a.cover_key, a.cover_url, a.like_count, a.created_at, a.completed_at, a.reveal_viewed_at, a.lifecycle_status, p.username, p.display_name, p.avatar_key from public.achievements a join public.profiles p on p.id = a.owner_id left join public.recommendation_category_scores score on score.user_id = auth.uid() and score.category = a.category where a.status = 'completed' and a.lifecycle_status = 'completed' and a.visibility = 'public' and a.hidden_at is null and a.revoked_at is null and a.moderation_status = 'active' and a.owner_id <> auth.uid() and p.is_discoverable and not private.users_are_blocked(auth.uid(), a.owner_id) and not exists (select 1 from public.feed_actions f where f.user_id = auth.uid() and f.achievement_id = a.id) order by coalesce(score.score, 0) desc, hashtextextended(a.id::text || current_date::text, 0) desc, a.created_at desc, a.id desc limit least(greatest(coalesce(p_limit, 24), 1), 40);
end;
$$;

create or replace function public.get_friend_feed_v2(p_limit integer default 30)
returns table (id uuid, owner_id uuid, title text, description text, category public.achievement_category, rarity public.achievement_rarity, achievement_date date, cover_key text, cover_url text, like_count integer, created_at timestamptz, owner_username extensions.citext, owner_display_name text, owner_avatar_key text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  return query select a.id,a.owner_id,a.title,a.description,a.category,a.rarity,a.achievement_date,a.cover_key,a.cover_url,a.like_count,a.created_at,p.username,p.display_name,p.avatar_key from public.achievements a join public.friendships f on f.status = 'accepted' and ((f.requester_id = auth.uid() and f.addressee_id = a.owner_id) or (f.addressee_id = auth.uid() and f.requester_id = a.owner_id)) join public.profiles p on p.id = a.owner_id where a.status = 'completed' and a.lifecycle_status = 'completed' and a.visibility = 'public' and a.hidden_at is null and a.revoked_at is null and a.moderation_status = 'active' and not private.users_are_blocked(auth.uid(), a.owner_id) order by a.created_at desc,a.id desc limit least(greatest(coalesce(p_limit,30),1),60);
end;
$$;

create or replace function public.get_collection_v2(p_lifecycle public.patch_lifecycle_status default null, p_category public.achievement_category default null, p_query text default null, p_sort text default 'newest', p_include_hidden boolean default false, p_limit integer default 80)
returns table (id uuid,owner_id uuid,title text,description text,category public.achievement_category,rarity public.achievement_rarity,status public.achievement_status,lifecycle_status public.patch_lifecycle_status,target_date date,hidden_at timestamptz,source_kind public.achievement_source_kind,source_key text,revoked_at timestamptz,moderation_status public.moderation_status,visibility public.achievement_visibility,achievement_date date,cover_key text,cover_url text,like_count integer,created_at timestamptz,completed_at timestamptz,reveal_viewed_at timestamptz,collection_viewed_at timestamptz)
language plpgsql stable security invoker set search_path = ''
as $$
declare v_query text := nullif(trim(coalesce(p_query, '')), ''); v_limit integer := least(greatest(coalesce(p_limit,80),1),120); v_sort text := case when p_sort in ('newest','title','rarity') then p_sort else 'newest' end;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  return query select a.id,a.owner_id,a.title,a.description,a.category,a.rarity,a.status,a.lifecycle_status,a.target_date,a.hidden_at,a.source_kind,a.source_key,a.revoked_at,a.moderation_status,a.visibility,a.achievement_date,a.cover_key,a.cover_url,a.like_count,a.created_at,a.completed_at,a.reveal_viewed_at,a.collection_viewed_at from public.achievements a where a.owner_id = auth.uid() and (p_lifecycle is null or a.lifecycle_status = p_lifecycle) and (p_category is null or a.category = p_category) and (p_include_hidden or a.hidden_at is null) and a.revoked_at is null and (v_query is null or a.search_document @@ websearch_to_tsquery('simple',v_query)) order by case when v_sort = 'title' then lower(a.title) end asc nulls last, case when v_sort = 'rarity' then case a.rarity::text when 'legendary' then 3 when 'rare' then 2 else 1 end end desc nulls last,a.created_at desc,a.id desc limit v_limit;
end;
$$;

revoke all on function public.create_patch_v2(text,text,public.achievement_category,public.achievement_rarity,public.achievement_visibility,public.patch_lifecycle_status,date,date,uuid), public.update_user_patch(uuid,text,text,public.achievement_category,public.achievement_rarity,public.achievement_visibility,date,date,uuid), public.get_discover_feed_v2(integer), public.get_friend_feed_v2(integer), public.get_collection_v2(public.patch_lifecycle_status,public.achievement_category,text,text,boolean,integer) from public, anon;
grant execute on function public.create_patch_v2(text,text,public.achievement_category,public.achievement_rarity,public.achievement_visibility,public.patch_lifecycle_status,date,date,uuid), public.update_user_patch(uuid,text,text,public.achievement_category,public.achievement_rarity,public.achievement_visibility,date,date,uuid), public.get_discover_feed_v2(integer), public.get_friend_feed_v2(integer), public.get_collection_v2(public.patch_lifecycle_status,public.achievement_category,text,text,boolean,integer) to authenticated;
grant execute on function public.claim_achievement_generation_jobs(integer,text,integer) to service_role;
