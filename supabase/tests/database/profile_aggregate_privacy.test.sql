begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'aggregate-owner@test.local', 'test', now(), now(), now()),
  ('c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'aggregate-viewer@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values
  ('c1000000-0000-4000-8000-000000000001', 'aggregate_owner', 'Aggregate Owner', 'trail'),
  ('c1000000-0000-4000-8000-000000000002', 'aggregate_viewer', 'Aggregate Viewer', 'trail');
insert into public.user_settings (user_id)
values
  ('c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002');

insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility,
  rarity, status, lifecycle_status, idempotency_key, cover_key, image_provider,
  completed_at, revoked_at, hidden_at, moderation_status
) values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Public Patch', 'This public Patch is countable.', 'social', current_date, 'public', 'common', 'completed', 'completed', 'c3000000-0000-4000-8000-000000000001', 'public', 'test', now(), null, null, 'active'),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'Private Patch', 'This private Patch is only owner-visible.', 'social', current_date, 'private', 'common', 'completed', 'completed', 'c3000000-0000-4000-8000-000000000002', 'private', 'test', now(), null, null, 'active'),
  ('c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'Revoked Patch', 'This revoked Patch must not count.', 'social', current_date, 'public', 'common', 'completed', 'locked', 'c3000000-0000-4000-8000-000000000003', 'revoked', 'test', now(), now(), null, 'active'),
  ('c2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'Hidden Patch', 'This hidden Patch must not count.', 'social', current_date, 'public', 'common', 'completed', 'completed', 'c3000000-0000-4000-8000-000000000004', 'hidden', 'test', now(), null, now(), 'active'),
  ('c2000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000001', 'Moderated Patch', 'This moderated Patch must not count.', 'social', current_date, 'public', 'common', 'completed', 'completed', 'c3000000-0000-4000-8000-000000000005', 'moderated', 'test', now(), null, null, 'hidden');

insert into public.likes (user_id, achievement_id)
values
  ('c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002');

select is(
  (select achievement_count from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  1,
  'public aggregate excludes private, revoked, hidden, and moderated Patches'
);
select is(
  (select owner_achievement_count from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  2,
  'owner aggregate includes only active public and private Patches'
);
select is(
  (select total_received_likes from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  1,
  'public likes exclude feedback on private Patches'
);
select is(
  (select owner_total_received_likes from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  2,
  'owner likes retain feedback on active private Patches'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select achievement_count from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  1,
  'a profile visitor sees only the public aggregate'
);
select throws_ok(
  $$select owner_achievement_count from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table profiles',
  'a profile visitor cannot query the owner-only aggregate'
);
select is(
  (select owner_achievement_count from public.get_current_profile_summary()),
  0,
  'the owner summary RPC never returns another user’s aggregate'
);
reset role;

update public.achievements
set visibility = 'private'
where id = 'c2000000-0000-4000-8000-000000000001';
select is(
  (select achievement_count from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  0,
  'visibility changes atomically recalculate the public aggregate'
);
select is(
  (select owner_achievement_count from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  2,
  'visibility changes do not change the owner aggregate'
);
select is(
  (select total_received_likes from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'),
  0,
  'visibility changes atomically recalculate public likes'
);

select * from finish();
rollback;
