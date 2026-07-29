-- Lease-based claiming prevents a dead worker from leaving a Patch permanently
-- running and fences a late worker from overwriting newer work.

alter table public.achievement_generation_jobs
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists worker_id text;

alter table public.achievement_generation_jobs
  drop constraint if exists achievement_generation_jobs_attempt_check;
alter table public.achievement_generation_jobs
  alter column attempt set default 0;
alter table public.achievement_generation_jobs
  add constraint achievement_generation_jobs_attempt_check check (attempt between 0 and 5);

-- The old queue counted a newly inserted row as attempt 1. From now on an
-- attempt is incremented only when a worker actually claims the row.
update public.achievement_generation_jobs
set attempt = greatest(attempt - 1, 0);

create index if not exists generation_jobs_lease_reclaim_idx
  on public.achievement_generation_jobs (lease_expires_at, created_at)
  where status = 'running';

create or replace function public.claim_achievement_generation_jobs(
  p_limit integer default 1,
  p_worker_id text default 'unknown-worker',
  p_lease_seconds integer default 90
)
returns table (
  job_id uuid,
  achievement_id uuid,
  owner_id uuid,
  attempt integer,
  lease_token uuid,
  lease_expires_at timestamptz,
  title text,
  category public.achievement_category,
  rarity public.achievement_rarity,
  idempotency_key uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 12);
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 90), 15), 600);
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 100 then
    raise exception 'worker id is invalid' using errcode = 'check_violation';
  end if;

  return query
  with candidates as (
    select j.id
    from public.achievement_generation_jobs j
    where (
      (j.status = 'queued' and j.available_at <= now())
      or (j.status = 'running' and j.lease_expires_at <= now())
    )
      and j.attempt < 5
    order by
      case when j.status = 'running' then 0 else 1 end,
      j.available_at,
      j.created_at
    limit v_limit
    for update skip locked
  ), claimed as (
    update public.achievement_generation_jobs j
    set status = 'running',
        attempt = j.attempt + 1,
        started_at = coalesce(j.started_at, now()),
        finished_at = null,
        error_message = null,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        heartbeat_at = now(),
        worker_id = trim(p_worker_id)
    from candidates c
    where j.id = c.id
    returning j.*
  )
  select c.id, c.achievement_id, c.owner_id, c.attempt, c.lease_token,
    c.lease_expires_at, a.title, a.category, a.rarity, a.idempotency_key
  from claimed c
  join public.achievements a on a.id = c.achievement_id;
end;
$$;

create or replace function public.heartbeat_achievement_generation_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 90), 15), 600);
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;
  update public.achievement_generation_jobs
  set heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => v_lease_seconds)
  where id = p_job_id
    and status = 'running'
    and lease_token = p_lease_token;
  return found;
end;
$$;

create or replace function public.complete_achievement_generation_job(
  p_job_id uuid,
  p_lease_token uuid,
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
  if char_length(trim(coalesce(p_cover_key, ''))) not between 1 and 120 then
    raise exception 'cover key is invalid' using errcode = 'check_violation';
  end if;

  select * into v_job from public.achievement_generation_jobs where id = p_job_id for update;
  if not found then
    raise exception 'generation job not found' using errcode = 'no_data_found';
  end if;
  if v_job.status = 'completed' then
    return case when v_job.lease_token = p_lease_token then v_job.achievement_id else null end;
  end if;
  if v_job.status <> 'running' or v_job.lease_token <> p_lease_token then
    return null;
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
  set status = 'completed', finished_at = now(), error_message = null,
      heartbeat_at = now(), lease_expires_at = now()
  where id = v_job.id and lease_token = p_lease_token and status = 'running';
  if not found then return null; end if;

  insert into public.notifications (
    owner_id, type, achievement_id, title, body, link, dedupe_key
  ) values (
    v_job.owner_id,
    'achievement_completed',
    v_job.achievement_id,
    'Achievement unlocked',
    'Your Patch is ready to reveal.',
    '/achievements/' || v_job.achievement_id::text,
    'achievement-completed:' || v_job.achievement_id::text
  ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;

  return v_job.achievement_id;
end;
$$;

create or replace function public.fail_achievement_generation_job(
  p_job_id uuid,
  p_lease_token uuid,
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
  select * into v_job from public.achievement_generation_jobs where id = p_job_id for update;
  if not found then raise exception 'generation job not found' using errcode = 'no_data_found'; end if;
  if v_job.status = 'completed' then
    return case when v_job.lease_token = p_lease_token then v_job.achievement_id else null end;
  end if;
  if v_job.status <> 'running' or v_job.lease_token <> p_lease_token then
    return null;
  end if;

  if p_retryable and v_job.attempt < 5 then
    update public.achievement_generation_jobs
    set status = 'queued',
        available_at = now() + make_interval(secs => least(3600, power(2, v_job.attempt)::integer)),
        error_message = v_message,
        lease_expires_at = null,
        heartbeat_at = null,
        worker_id = null
    where id = v_job.id and status = 'running' and lease_token = p_lease_token;
    return case when found then v_job.achievement_id else null end;
  end if;

  update public.achievement_generation_jobs
  set status = 'failed', finished_at = now(), error_message = v_message,
      heartbeat_at = now(), lease_expires_at = now()
  where id = v_job.id and status = 'running' and lease_token = p_lease_token;
  if not found then return null; end if;

  update public.achievements
  set status = 'failed', failure_reason = v_message
  where id = v_job.achievement_id;

  insert into public.notifications (
    owner_id, type, achievement_id, title, body, link, dedupe_key
  ) values (
    v_job.owner_id,
    'achievement_failed',
    v_job.achievement_id,
    'Patch needs another try',
    'Your story was saved. You can retry its illustration.',
    '/achievements/' || v_job.achievement_id::text,
    'achievement-failed:' || v_job.achievement_id::text
  ) on conflict (owner_id, dedupe_key) where dedupe_key is not null do nothing;
  return v_job.achievement_id;
end;
$$;

create or replace function public.retry_achievement_generation(p_achievement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patch public.achievements%rowtype;
  v_job_id uuid;
begin
  select * into v_patch from private.assert_patch_owner(p_achievement_id, true);
  if v_patch.lifecycle_status <> 'completed' then
    raise exception 'complete the Patch before generating artwork' using errcode = 'check_violation';
  end if;
  if v_patch.status <> 'failed' then
    raise exception 'only failed artwork can be retried' using errcode = 'check_violation';
  end if;
  update public.achievements set status = 'processing', failure_reason = null where id = v_patch.id;
  insert into public.achievement_generation_jobs (
    achievement_id, owner_id, provider, available_at
  ) values (v_patch.id, v_patch.owner_id, 'patch-deterministic', now()) returning id into v_job_id;
  return v_job_id;
end;
$$;

-- Legacy worker endpoints cannot provide a lease token and are deliberately
-- revoked. The updated Edge Function below uses only fenced v2 calls.
revoke all on function public.claim_next_achievement_generation_job() from public, anon, authenticated, service_role;
revoke all on function public.complete_achievement_generation_job(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.fail_achievement_generation_job(uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.claim_achievement_generation_jobs(integer, text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_achievement_generation_job(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_achievement_generation_job(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_achievement_generation_job(uuid, uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.claim_achievement_generation_jobs(integer, text, integer) to service_role;
grant execute on function public.heartbeat_achievement_generation_job(uuid, uuid, integer) to service_role;
grant execute on function public.complete_achievement_generation_job(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_achievement_generation_job(uuid, uuid, text, boolean) to service_role;
grant execute on function public.retry_achievement_generation(uuid) to authenticated;
