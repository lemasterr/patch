begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'controls@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values ('b1000000-0000-4000-8000-000000000001', 'controls_user', 'Controls user', 'trail');
insert into public.user_settings (user_id) values ('b1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select enabled from public.get_runtime_feature_flags_v1()
   where key = 'discover_recommendation_rounds'),
  true,
  'runtime flags provide the enabled recommendation rollout'
);
select is(
  (select enabled from public.get_runtime_feature_flags_v1()
   where key = 'content_moderation_pipeline'),
  false,
  'disabled features remain off for every cohort'
);
select is(
  (select enabled from public.get_runtime_feature_flags_v1()
   where key = 'patch_creation_enabled'),
  true,
  'released client controls default to enabled'
);
reset role;
update public.feature_flags set enabled = false where key = 'patch_creation_enabled';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select enabled from public.get_runtime_feature_flags_v1()
   where key = 'patch_creation_enabled'),
  false,
  'feature controls support an emergency disable'
);

select lives_ok(
  $$select public.record_product_analytics_event_v1(
    'reaction', null, 'discover', 'b2000000-0000-4000-8000-000000000001'
  )$$,
  'allow-listed product analytics event is accepted'
);
select lives_ok(
  $$select public.record_product_analytics_event_v1(
    'reaction', null, 'discover', 'b2000000-0000-4000-8000-000000000001'
  )$$,
  'analytics operation is idempotent'
);
select is(
  (select count(*)::integer from public.product_analytics_events),
  1,
  'analytics stores only one operation record'
);

reset role;
select * from finish();
rollback;
