begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values (
  'c7000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'timezone@test.local', 'test', now(), now(), now()
);
insert into public.profiles (id, username, display_name, avatar_key, onboarding_completed)
values (
  'c7000000-0000-4000-8000-000000000001', 'timezone_tester', 'Timezone Tester', 'trail', true
);
insert into public.user_settings (user_id)
values ('c7000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c7000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  public.set_user_time_zone('Pacific/Kiritimati'),
  'Pacific/Kiritimati',
  'an authenticated user can save a valid IANA time zone'
);
select is(
  (select time_zone from public.get_current_profile_summary()),
  'Pacific/Kiritimati',
  'the owner summary returns only the owner time zone'
);
select throws_ok(
  $$select public.set_user_time_zone('Not/A_Real_Zone')$$,
  '22023',
  'invalid IANA time zone',
  'the time-zone RPC rejects values outside the IANA catalog'
);

select lives_ok(
  $$select * from public.create_patch_v2(
    'Local today', 'A calendar date in the owner time zone is valid.', 'travel', 'common',
    'private', 'locked', (statement_timestamp() at time zone 'Pacific/Kiritimati')::date,
    null, 'c7000000-0000-4000-8000-000000000010'
  )$$,
  'Patch creation accepts the owner-local current calendar date'
);
select throws_ok(
  $$select * from public.create_patch_v2(
    'Tomorrow', 'A date after the owner-local current date is rejected.', 'travel', 'common',
    'private', 'locked', (statement_timestamp() at time zone 'Pacific/Kiritimati')::date + 1,
    null, 'c7000000-0000-4000-8000-000000000011'
  )$$,
  '23514',
  'Patch fields are invalid',
  'Patch creation rejects tomorrow in the owner time zone'
);
select lives_ok(
  $$select public.update_user_patch(
    (select id from public.achievements where idempotency_key = 'c7000000-0000-4000-8000-000000000010'),
    'Updated local today', 'Editing uses the same owner-local calendar date.', 'travel', 'common',
    'private', (statement_timestamp() at time zone 'Pacific/Kiritimati')::date, null,
    'c7000000-0000-4000-8000-000000000012'
  )$$,
  'Patch editing accepts the owner-local current calendar date'
);
select lives_ok(
  $$select public.add_patch_event(
    (select id from public.achievements where idempotency_key = 'c7000000-0000-4000-8000-000000000010'),
    'note', (statement_timestamp() at time zone 'Pacific/Kiritimati')::date,
    'Local note', 'This event uses a calendar date.', null, null,
    'c7000000-0000-4000-8000-000000000013'
  )$$,
  'adding an event accepts the owner-local current calendar date'
);
select lives_ok(
  $$select public.update_patch_event(
    (select id from public.achievement_events where operation_id = 'c7000000-0000-4000-8000-000000000013'),
    (statement_timestamp() at time zone 'Pacific/Kiritimati')::date,
    'Updated local note', 'The edit uses a calendar date.', null, null,
    'c7000000-0000-4000-8000-000000000014'
  )$$,
  'editing an event accepts the owner-local current calendar date'
);
select lives_ok(
  $$select public.set_country_visit_v2(
    'AD', 'Andorra', 'visited', null, null, null,
    'c7000000-0000-4000-8000-000000000015'
  )$$,
  'travel writes use the owner-local calendar date'
);
select is(
  (select visited_at from public.visited_countries where country_code = 'AD' and user_id = auth.uid()),
  (statement_timestamp() at time zone 'Pacific/Kiritimati')::date,
  'travel stores the owner-local current calendar date'
);

reset role;
select * from finish();
rollback;
