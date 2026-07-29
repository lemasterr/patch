begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_column('public', 'achievement_generation_jobs', 'lease_token', 'queue stores a lease token');
select has_column('public', 'achievement_generation_jobs', 'lease_expires_at', 'queue stores lease expiry');
select has_function('public', 'claim_achievement_generation_jobs', 'lease-aware claim RPC exists');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('22222222-bbbb-4bbb-8bbb-222222222222', 'authenticated', 'authenticated', 'queue@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values ('22222222-bbbb-4bbb-8bbb-222222222222', 'queue_user', 'Queue', 'trail');

insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility,
  rarity, lifecycle_status, status, idempotency_key
) values (
  '33333333-cccc-4ccc-8ccc-333333333333',
  '22222222-bbbb-4bbb-8bbb-222222222222', 'Lease Patch', 'A Patch for lease recovery.',
  'work', current_date, 'private', 'common', 'completed', 'processing',
  '44444444-dddd-4ddd-8ddd-444444444444'
);
insert into public.achievement_generation_jobs (achievement_id, owner_id, available_at)
values ('33333333-cccc-4ccc-8ccc-333333333333', '22222222-bbbb-4bbb-8bbb-222222222222', now());

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table worker_a on commit drop as
select * from public.claim_achievement_generation_jobs(1, 'worker-a', 30);
select is((select count(*)::integer from worker_a), 1, 'worker A claims queued work');
select is((select attempt from worker_a), 1, 'attempt increments on actual claim only');
select ok((select lease_token is not null from worker_a), 'claim returns a fencing token');

update public.achievement_generation_jobs
set lease_expires_at = now() - interval '1 second'
where id = (select job_id from worker_a);
create temporary table worker_b on commit drop as
select * from public.claim_achievement_generation_jobs(1, 'worker-b', 30);
select is((select count(*)::integer from worker_b), 1, 'worker B reclaims expired work');
select isnt((select lease_token from worker_a), (select lease_token from worker_b), 'reclaim receives a new token');
select is((select attempt from worker_b), 2, 'reclaim records a second actual attempt');

select is(
  (select public.complete_achievement_generation_job(job_id, lease_token, 'stale-cover', 'test') from worker_a),
  null::uuid,
  'a stale worker cannot complete reclaimed work'
);
select is((select status::text from public.achievement_generation_jobs where id = (select job_id from worker_b)), 'running', 'stale completion leaves new lease running');
select is(
  (select public.complete_achievement_generation_job(job_id, lease_token, 'fresh-cover', 'test') from worker_b),
  (select achievement_id from worker_b),
  'current worker completes the job'
);
select is(
  (select public.complete_achievement_generation_job(job_id, lease_token, 'fresh-cover', 'test') from worker_b),
  (select achievement_id from worker_b),
  'second completion with the same token is idempotent'
);

insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility,
  rarity, lifecycle_status, status, idempotency_key
) values (
  '55555555-eeee-4eee-8eee-555555555555',
  '22222222-bbbb-4bbb-8bbb-222222222222', 'Final failure', 'A Patch that exhausts retries.',
  'work', current_date, 'private', 'common', 'completed', 'processing',
  '66666666-ffff-4fff-8fff-666666666666'
);
insert into public.achievement_generation_jobs (achievement_id, owner_id, available_at, attempt)
values ('55555555-eeee-4eee-8eee-555555555555', '22222222-bbbb-4bbb-8bbb-222222222222', now(), 4);
create temporary table last_attempt on commit drop as
select * from public.claim_achievement_generation_jobs(1, 'worker-final', 30);
select is((select attempt from last_attempt), 5, 'last permitted attempt can be claimed');
select is(
  (select public.fail_achievement_generation_job(job_id, lease_token, 'provider unavailable', true) from last_attempt),
  (select achievement_id from last_attempt),
  'max-attempt job settles instead of requeueing'
);
select is((select status::text from public.achievement_generation_jobs where id = (select job_id from last_attempt)), 'failed', 'max-attempt job is finally failed');
select is((select status::text from public.achievements where id = (select achievement_id from last_attempt)), 'failed', 'final queue failure reaches Patch generation state');

reset role;
select * from finish();
rollback;
