begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('c4000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'push-alpha@test.local', 'test', now(), now(), now()),
  ('c4000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'push-bravo@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values
  ('c4000000-0000-4000-8000-000000000001', 'push_alpha', 'Push Alpha', 'trail'),
  ('c4000000-0000-4000-8000-000000000002', 'push_bravo', 'Push Bravo', 'trail');
insert into public.user_settings (user_id)
values
  ('c4000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.register_push_device('native-apns-token', 'ios', 'install-push-test-0001')$$,
  '22023',
  'invalid push device',
  'the Expo push endpoint rejects a native APNs or FCM token'
);
select ok(
  public.register_push_device(
    'ExpoPushToken[aaaaaaaaaaaaaaaaaaaaaaaa]', 'ios', 'install-push-test-0001'
  ) is not null,
  'an Expo token registers to one installation'
);
select lives_ok(
  $$select public.register_push_device('ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbbbb]', 'ios', 'install-push-test-0001')$$,
  'a token rotation updates the existing installation'
);
reset role;
select is((select count(*)::integer from public.push_devices), 1, 'rotation does not duplicate the installation');
select is(
  (select expo_push_token from public.push_devices),
  'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbbbb]',
  'only the fresh Expo token remains active after rotation'
);

insert into public.notifications (owner_id, type, title, body, link, dedupe_key)
values ('c4000000-0000-4000-8000-000000000001', 'achievement_liked', 'Like', 'A queued push.', '/notifications', 'switch-test');
select is((select count(*)::integer from public.push_deliveries where status = 'queued'), 1, 'account A has a queued delivery before the switch');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.register_push_device('ExpoPushToken[cccccccccccccccccccccccc]', 'ios', 'install-push-test-0001')$$,
  'account B can claim the same physical installation'
);
reset role;
select is(
  (select user_id from public.push_devices),
  'c4000000-0000-4000-8000-000000000002'::uuid,
  'the installation is now owned by account B'
);
select is(
  (select status from public.push_deliveries),
  'disabled'::public.push_delivery_status,
  'a queued delivery for account A is disabled before account B receives push'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.disable_push_installation('install-push-test-0001')$$, 'account A cannot disable account B device');
reset role;
select ok((select enabled from public.push_devices), 'account B device remains enabled after an A logout tombstone');

select * from finish();
rollback;
