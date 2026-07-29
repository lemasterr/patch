-- Native achievement creation now uses a durable database queue. Only Supabase
-- Edge Functions running with the service role may claim or settle work.

alter table public.achievement_generation_jobs
  add column if not exists available_at timestamptz not null default now();

create index if not exists generation_jobs_queue_idx
  on public.achievement_generation_jobs (available_at, created_at)
  where status = 'queued';

create or replace function public.create_achievement_for_generation(
  p_title text,
  p_description text,
  p_category public.achievement_category,
  p_achievement_date date,
  p_visibility public.achievement_visibility,
  p_rarity public.achievement_rarity,
  p_location_text text,
  p_location_latitude double precision,
  p_location_longitude double precision,
  p_tags text[],
  p_idempotency_key uuid
)
returns table (achievement_id uuid, job_id uuid, was_existing boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_achievement_id uuid;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(p_title)) not between 2 and 80 then
    raise exception 'title must contain 2 to 80 characters' using errcode = 'check_violation';
  end if;
  if char_length(trim(p_description)) not between 2 and 600 then
    raise exception 'description must contain 2 to 600 characters' using errcode = 'check_violation';
  end if;
  if p_achievement_date is null or p_achievement_date > current_date then
    raise exception 'achievement date cannot be in the future' using errcode = 'check_violation';
  end if;
  if (p_location_latitude is null) <> (p_location_longitude is null) then
    raise exception 'coordinates must be provided together' using errcode = 'check_violation';
  end if;
  if p_location_latitude is not null and
    (p_location_latitude not between -90 and 90 or p_location_longitude not between -180 and 180)
  then
    raise exception 'coordinates are outside valid bounds' using errcode = 'check_violation';
  end if;
  if coalesce(cardinality(p_tags), 0) > 10 or exists (
    select 1
    from unnest(coalesce(p_tags, '{}'::text[])) as tag(value)
    where char_length(trim(value)) not between 1 and 32
  ) then
    raise exception 'use up to 10 tags of 1 to 32 characters' using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_idempotency_key::text, 0)
  );

  select a.id into v_achievement_id
  from public.achievements a
  where a.owner_id = v_user_id and a.idempotency_key = p_idempotency_key;

  if v_achievement_id is not null then
    select j.id into v_job_id
    from public.achievement_generation_jobs j
    where j.achievement_id = v_achievement_id
    order by j.attempt desc
    limit 1;
    return query select v_achievement_id, v_job_id, true;
    return;
  end if;

  insert into public.achievements (
    owner_id, title, description, category, achievement_date, visibility,
    rarity, location_text, location_latitude, location_longitude, tags,
    status, idempotency_key
  ) values (
    v_user_id, trim(p_title), trim(p_description), p_category,
    p_achievement_date, p_visibility, p_rarity,
    nullif(trim(coalesce(p_location_text, '')), ''),
    p_location_latitude, p_location_longitude,
    coalesce(array(
      select distinct trim(value)
      from unnest(coalesce(p_tags, '{}'::text[])) as tag(value)
      where trim(value) <> ''
    ), '{}'::text[]),
    'processing', p_idempotency_key
  ) returning id into v_achievement_id;

  insert into public.achievement_generation_jobs (
    achievement_id, owner_id, provider, available_at
  ) values (
    v_achievement_id, v_user_id, 'patch-deterministic', now()
  ) returning id into v_job_id;

  return query select v_achievement_id, v_job_id, false;
end;
$$;

create or replace function public.claim_next_achievement_generation_job()
returns table (
  job_id uuid,
  achievement_id uuid,
  owner_id uuid,
  attempt integer,
  title text,
  category public.achievement_category,
  rarity public.achievement_rarity,
  idempotency_key uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;

  return query
  with next_job as (
    select j.id
    from public.achievement_generation_jobs j
    where j.status = 'queued' and j.available_at <= now()
    order by j.available_at, j.created_at
    limit 1
    for update skip locked
  ), claimed as (
    update public.achievement_generation_jobs j
    set status = 'running', started_at = now(), error_message = null
    from next_job n
    where j.id = n.id
    returning j.id, j.achievement_id, j.owner_id, j.attempt
  )
  select c.id, c.achievement_id, c.owner_id, c.attempt,
    a.title, a.category, a.rarity, a.idempotency_key
  from claimed c
  join public.achievements a on a.id = c.achievement_id;
end;
$$;

create or replace function public.complete_achievement_generation_job(
  p_job_id uuid,
  p_cover_key text,
  p_provider text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.achievement_generation_jobs%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(p_cover_key)) not between 1 and 120 then
    raise exception 'cover key is invalid' using errcode = 'check_violation';
  end if;

  select * into v_job
  from public.achievement_generation_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'generation job not found' using errcode = 'no_data_found';
  end if;
  if v_job.status = 'completed' then
    return v_job.achievement_id;
  end if;
  if v_job.status <> 'running' then
    raise exception 'generation job is not running' using errcode = 'check_violation';
  end if;

  update public.achievements
  set status = 'completed',
    cover_key = trim(p_cover_key),
    cover_url = null,
    image_provider = trim(p_provider),
    failure_reason = null,
    completed_at = now()
  where id = v_job.achievement_id;

  update public.achievement_generation_jobs
  set status = 'completed', finished_at = now(), error_message = null
  where id = v_job.id;

  insert into public.notifications (
    owner_id, type, achievement_id, title, body, link, dedupe_key
  ) values (
    v_job.owner_id,
    'achievement_completed',
    v_job.achievement_id,
    'Achievement unlocked',
    'Your achievement is ready to reveal.',
    '/achievements/' || v_job.achievement_id::text,
    'achievement-completed:' || v_job.achievement_id::text
  ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;

  return v_job.achievement_id;
end;
$$;

create or replace function public.fail_achievement_generation_job(
  p_job_id uuid,
  p_message text,
  p_retryable boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.achievement_generation_jobs%rowtype;
  v_message text := left(trim(coalesce(p_message, 'Image generation failed.')), 220);
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_job
  from public.achievement_generation_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'generation job not found' using errcode = 'no_data_found';
  end if;
  if v_job.status = 'completed' then
    return v_job.achievement_id;
  end if;
  if v_job.status <> 'running' then
    raise exception 'generation job is not running' using errcode = 'check_violation';
  end if;

  update public.achievement_generation_jobs
  set status = 'failed', finished_at = now(), error_message = v_message
  where id = v_job.id;

  if p_retryable and v_job.attempt < 5 then
    insert into public.achievement_generation_jobs (
      achievement_id, owner_id, attempt, provider, available_at
    ) values (
      v_job.achievement_id,
      v_job.owner_id,
      v_job.attempt + 1,
      v_job.provider,
      now() + make_interval(secs => power(2, v_job.attempt)::integer)
    );
    return v_job.achievement_id;
  end if;

  update public.achievements
  set status = 'failed', failure_reason = v_message
  where id = v_job.achievement_id;

  insert into public.notifications (
    owner_id, type, achievement_id, title, body, link, dedupe_key
  ) values (
    v_job.owner_id,
    'achievement_failed',
    v_job.achievement_id,
    'Achievement needs another try',
    'Your story was saved. You can retry its illustration.',
    '/achievements/' || v_job.achievement_id::text,
    'achievement-failed:' || v_job.achievement_id::text
  ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;

  return v_job.achievement_id;
end;
$$;

create or replace function public.retry_achievement_generation(
  p_achievement_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_achievement public.achievements%rowtype;
  v_attempt integer;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_achievement
  from public.achievements
  where id = p_achievement_id and owner_id = v_user_id
  for update;
  if not found then
    raise exception 'achievement not found' using errcode = 'no_data_found';
  end if;
  if v_achievement.status <> 'failed' then
    raise exception 'only failed achievements can be retried' using errcode = 'check_violation';
  end if;

  select coalesce(max(attempt), 0) into v_attempt
  from public.achievement_generation_jobs
  where achievement_id = v_achievement.id;
  if v_attempt >= 5 then
    raise exception 'maximum generation attempts reached' using errcode = 'check_violation';
  end if;

  update public.achievements
  set status = 'processing', failure_reason = null
  where id = v_achievement.id;

  insert into public.achievement_generation_jobs (
    achievement_id, owner_id, attempt, provider, available_at
  ) values (
    v_achievement.id,
    v_user_id,
    v_attempt + 1,
    'patch-deterministic',
    now()
  ) returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.create_achievement_with_job(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.create_mobile_achievement(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, double precision, double precision, uuid) from public, anon, authenticated;
drop function public.create_achievement_with_job(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, text[], uuid);
drop function public.create_mobile_achievement(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, double precision, double precision, uuid);

revoke all on function public.create_achievement_for_generation(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, double precision, double precision, text[], uuid) from public, anon;
revoke all on function public.retry_achievement_generation(uuid) from public, anon;
revoke all on function public.claim_next_achievement_generation_job() from public, anon, authenticated;
revoke all on function public.complete_achievement_generation_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_achievement_generation_job(uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.create_achievement_for_generation(text, text, public.achievement_category, date, public.achievement_visibility, public.achievement_rarity, text, double precision, double precision, text[], uuid) to authenticated;
grant execute on function public.retry_achievement_generation(uuid) to authenticated;
grant execute on function public.claim_next_achievement_generation_job() to service_role;
grant execute on function public.complete_achievement_generation_job(uuid, text, text) to service_role;
grant execute on function public.fail_achievement_generation_job(uuid, text, boolean) to service_role;
