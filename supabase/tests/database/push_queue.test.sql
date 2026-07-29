begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'push@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values ('f1000000-0000-4000-8000-000000000001', 'push_user', 'Push user', 'trail');
insert into public.user_settings (user_id, push_notifications, push_likes)
values ('f1000000-0000-4000-8000-000000000001', true, true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(public.register_push_device('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaaaa]', 'ios') is not null, 'physical installation token registers through RPC');
select throws_ok($$select * from public.push_devices$$, '42501', 'permission denied for table push_devices', 'client cannot directly read token rows');
reset role;

select is((select count(*)::integer from public.push_devices), 1, 'registered device is stored server-side');
insert into public.notifications (owner_id, type, title, body, link, dedupe_key)
values ('f1000000-0000-4000-8000-000000000001', 'achievement_liked', 'Like', 'Someone liked a Patch.', '/achievement/fake', 'push-test:one');
select is((select count(*)::integer from public.push_deliveries), 1, 'notification queues one delivery for active device');
select is((select body from public.push_deliveries), 'Open Patch to see your new activity.', 'private preview preference redacts lock-screen body');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table claimed_push on commit drop as
select * from public.claim_push_deliveries('pgtap', 1, 60);
select is((select count(*)::integer from claimed_push), 1, 'service worker claims queued delivery with lease');
select is((select public.complete_push_delivery(id, lease_token, 'ticket-1') from claimed_push), true, 'lease holder completes delivery');
select is((select public.complete_push_delivery(id, lease_token, 'ticket-2') from claimed_push), false, 'stale completion is fenced');
reset role;

update public.user_settings set push_notifications = false where user_id = 'f1000000-0000-4000-8000-000000000001';
insert into public.notifications (owner_id, type, title, body, link, dedupe_key)
values ('f1000000-0000-4000-8000-000000000001', 'achievement_liked', 'Like', 'No remote push should queue.', '/achievement/fake', 'push-test:two');
select is((select count(*)::integer from public.push_deliveries), 1, 'master preference off prevents new delivery creation');

update public.user_settings
set push_notifications = true, push_likes = true
where user_id = 'f1000000-0000-4000-8000-000000000001';
insert into public.notifications (owner_id, type, title, body, link, dedupe_key)
values ('f1000000-0000-4000-8000-000000000001', 'achievement_liked', 'Like', 'Queued before preference change.', '/achievement/fake', 'push-test:three');
update public.user_settings set push_likes = false where user_id = 'f1000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table preference_disabled_claim on commit drop as
select * from public.claim_push_deliveries('pgtap', 1, 60);
select is((select count(*)::integer from preference_disabled_claim), 0, 'current preference prevents a queued delivery from being claimed');
reset role;
select is(
  (select status from public.push_deliveries where notification_id = (
    select id from public.notifications where dedupe_key = 'push-test:three'
  )),
  'disabled'::public.push_delivery_status,
  'delivery disabled between queueing and sending is terminal'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.disable_push_device('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaaaa]')$$, 'logout can disable own installation token');
reset role;
select is((select enabled from public.push_devices), false, 'disabled token cannot receive future deliveries');

select * from finish();
rollback;
