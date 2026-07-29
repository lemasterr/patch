begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('d9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'delete-target@test.local', 'test', now(), now(), now()),
  ('d9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'delete-survivor@test.local', 'test', now(), now(), now());

insert into public.profiles (id, username, display_name, avatar_key)
values
  ('d9000000-0000-4000-8000-000000000001', 'delete_target', 'Delete Target', 'trail'),
  ('d9000000-0000-4000-8000-000000000002', 'delete_survivor', 'Delete Survivor', 'summit');
insert into public.user_settings (user_id) values
  ('d9000000-0000-4000-8000-000000000001'),
  ('d9000000-0000-4000-8000-000000000002');
insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility,
  rarity, status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at
) values (
  'd9000000-0000-4000-8000-000000000011',
  'd9000000-0000-4000-8000-000000000001',
  'Deletion Patch', 'A Patch used only to verify account-deletion cascades.',
  'social', current_date, 'public', 'rare', 'completed', 'completed',
  'd9000000-0000-4000-8000-000000000012', 'deletion-patch', 'local-pixel', now()
);
insert into public.achievement_events (
  achievement_id, owner_id, operation_id, kind, event_date
) values (
  'd9000000-0000-4000-8000-000000000011',
  'd9000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000013', 'created', current_date
);
insert into public.achievement_generation_jobs (achievement_id, owner_id)
values (
  'd9000000-0000-4000-8000-000000000011',
  'd9000000-0000-4000-8000-000000000001'
);
insert into public.friendships (requester_id, addressee_id, status)
values (
  'd9000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000002',
  'accepted'
);
insert into public.user_blocks (blocker_id, blocked_id)
values (
  'd9000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000002'
);
insert into public.notifications (owner_id, actor_id, type, title, body, link)
values (
  'd9000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000002',
  'friend_request', 'Account deletion', 'This row must cascade.', '/notifications'
);
insert into public.push_devices (user_id, expo_push_token, platform)
values (
  'd9000000-0000-4000-8000-000000000001',
  'ExponentPushToken[account-deletion-test]', 'ios'
);
insert into public.product_analytics_events (
  user_id, event_name, operation_id
) values (
  'd9000000-0000-4000-8000-000000000001',
  'retention', 'd9000000-0000-4000-8000-000000000014'
);
insert into public.content_reports (
  reporter_id, reported_user_id, achievement_id, reason, detail
) values
  (
    'd9000000-0000-4000-8000-000000000002',
    'd9000000-0000-4000-8000-000000000001',
    'd9000000-0000-4000-8000-000000000011',
    'spam', 'Report retained for abuse trend analysis.'
  ),
  (
    'd9000000-0000-4000-8000-000000000001',
    'd9000000-0000-4000-8000-000000000002',
    null,
    'spam', 'Report filed by the account being deleted.'
  );

delete from auth.users where id = 'd9000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from auth.users where id = 'd9000000-0000-4000-8000-000000000001'),
  0,
  'hard deletion removes the Auth user and therefore invalidates its sessions'
);
select is(
  (select count(*)::integer from public.profiles where id = 'd9000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.user_settings where user_id = 'd9000000-0000-4000-8000-000000000001'),
  0,
  'profile and settings are removed'
);
select is(
  (select count(*)::integer from public.achievements where owner_id = 'd9000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.achievement_events where owner_id = 'd9000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.achievement_generation_jobs where owner_id = 'd9000000-0000-4000-8000-000000000001'),
  0,
  'Patches, their lifecycle events, and in-flight generation jobs are removed'
);
select is(
  (select count(*)::integer from public.friendships where requester_id = 'd9000000-0000-4000-8000-000000000001' or addressee_id = 'd9000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.user_blocks where blocker_id = 'd9000000-0000-4000-8000-000000000001' or blocked_id = 'd9000000-0000-4000-8000-000000000001'),
  0,
  'friendships and blocks are removed from both sides'
);
select is(
  (select count(*)::integer from public.notifications where owner_id = 'd9000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.push_devices where user_id = 'd9000000-0000-4000-8000-000000000001'),
  0,
  'notifications and registered push devices are removed'
);
select is(
  (select count(*)::integer from public.product_analytics_events where user_id = 'd9000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.visited_countries where user_id = 'd9000000-0000-4000-8000-000000000001'),
  0,
  'product analytics and travel history are removed'
);
select is(
  (select count(*)::integer from public.content_reports where reporter_id = 'd9000000-0000-4000-8000-000000000001'),
  0,
  'reports filed by the deleted user are removed'
);
select ok(
  exists (
    select 1
    from public.content_reports
    where reporter_id = 'd9000000-0000-4000-8000-000000000002'
      and reported_user_id is null
      and achievement_id is null
      and detail = 'Report retained for abuse trend analysis.'
  ),
  'reports about deleted content remain without profile or Patch identifiers'
);

select * from finish();
rollback;
