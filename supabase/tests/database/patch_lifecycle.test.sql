begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public', 'achievement_events', 'Patch history table exists');
select has_column('public', 'achievements', 'lifecycle_status', 'Patches have an independent lifecycle');
select has_column('public', 'achievements', 'source_kind', 'Patches record their source');
select has_function('public', 'create_patch_v2', 'v2 Patch creation RPC exists');
select has_function('public', 'set_patch_lifecycle', 'lifecycle transition RPC exists');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-aaaa-4aaa-8aaa-111111111111', 'authenticated', 'authenticated', 'lifecycle@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values ('11111111-aaaa-4aaa-8aaa-111111111111', 'lifecycle_user', 'Lifecycle', 'trail');
insert into public.user_settings (user_id) values ('11111111-aaaa-4aaa-8aaa-111111111111');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-aaaa-4aaa-8aaa-111111111111","role":"authenticated"}', true);

create temporary table locked_patch on commit drop as
select * from public.create_patch_v2(
  'Run a first marathon', 'Training one steady kilometre at a time.',
  'health', 'rare', 'private', 'locked', current_date, current_date + 90,
  '11111111-0000-4000-8000-000000000001'
);

select is((select lifecycle_status::text from locked_patch), 'locked', 'a goal starts locked');
select is((select generation_status::text from locked_patch), 'draft', 'a goal does not start image generation');
select is((select count(*)::integer from public.achievement_generation_jobs where achievement_id = (select achievement_id from locked_patch)), 0, 'locked Patch creates no job');
select is((select count(*)::integer from public.achievement_events where achievement_id = (select achievement_id from locked_patch)), 1, 'creation creates exactly one history event');

create temporary table progress_patch on commit drop as
select * from public.set_patch_lifecycle(
  (select achievement_id from locked_patch), 'in_progress', current_date,
  'Started a training plan.', '11111111-0000-4000-8000-000000000002'
);
select is((select lifecycle_status::text from progress_patch), 'in_progress', 'goal can become in progress');
select is((select count(*)::integer from public.achievement_generation_jobs where achievement_id = (select achievement_id from locked_patch)), 0, 'in-progress Patch still has no job');

select public.add_patch_event(
  (select achievement_id from locked_patch), 'progress', current_date,
  'First long run', 'Covered 10 km.', 10, 'km',
  '11111111-0000-4000-8000-000000000003'
);
select is((select count(*)::integer from public.achievement_events where achievement_id = (select achievement_id from locked_patch)), 3, 'an update extends the same Patch history');

create temporary table completed_patch on commit drop as
select * from public.set_patch_lifecycle(
  (select achievement_id from locked_patch), 'completed', current_date,
  'Crossed the finish line.', '11111111-0000-4000-8000-000000000004'
);
select is((select lifecycle_status::text from completed_patch), 'completed', 'Patch can be completed');
select is((select generation_status::text from completed_patch), 'processing', 'completion begins generation state');
select is((select count(*)::integer from public.achievement_generation_jobs where achievement_id = (select achievement_id from locked_patch)), 1, 'completion queues exactly one job');

select lives_ok(
  $$select public.set_patch_lifecycle(
    (select achievement_id from locked_patch), 'completed', current_date,
    'Crossed the finish line.', '11111111-0000-4000-8000-000000000004'
  )$$,
  'replaying a lifecycle operation is safe'
);
select is((select count(*)::integer from public.achievement_generation_jobs where achievement_id = (select achievement_id from locked_patch)), 1, 'replay cannot create a duplicate generation job');

select throws_ok(
  $$select public.set_patch_lifecycle(
    (select achievement_id from locked_patch), 'locked', current_date,
    null, '11111111-0000-4000-8000-000000000005'
  )$$,
  '23514',
  'confirm reverting a completed Patch before changing its lifecycle',
  'completed lifecycle requires explicit confirmation before a revert'
);

reset role;
select * from finish();
rollback;
