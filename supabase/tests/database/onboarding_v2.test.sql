begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('c6000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'partial-profile@test.local', 'test', now(), now(), now()),
  ('c6000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'taken-profile@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key, onboarding_completed)
values
  ('c6000000-0000-4000-8000-000000000001', 'partial_legacy', 'Partial Legacy', 'trail', false),
  ('c6000000-0000-4000-8000-000000000002', 'taken_handle', 'Taken Handle', 'trail', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c6000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.complete_onboarding_v2('finished_handle', 'Finished Handle')$$,
  'a partial profile completes through the v2 onboarding RPC'
);
select is(
  (select username::text from public.profiles where id = auth.uid()),
  'finished_handle',
  'the partial profile receives the selected username'
);
select is(
  (select onboarding_completed from public.profiles where id = auth.uid()),
  true,
  'the partial profile exits onboarding'
);
select is(
  (select count(*)::integer from public.user_settings where user_id = auth.uid()),
  1,
  'the v2 RPC creates missing settings for a partial profile'
);
select lives_ok(
  $$select public.complete_onboarding_v2('ignored_retry', 'Ignored Retry')$$,
  'a completed onboarding call is idempotent'
);
select is(
  (select username::text from public.profiles where id = auth.uid()),
  'finished_handle',
  'an idempotent retry cannot rewrite a finished username'
);

reset role;
select * from finish();
rollback;
