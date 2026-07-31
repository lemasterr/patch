begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('fe000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'guide-alpha@test.local', 'test', now(), now(), now()),
  ('fe000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'guide-bravo@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values
  ('fe000000-0000-4000-8000-000000000001', 'guide_alpha', 'Guide Alpha', 'trail'),
  ('fe000000-0000-4000-8000-000000000002', 'guide_bravo', 'Guide Bravo', 'summit');
insert into public.user_settings (user_id)
values
  ('fe000000-0000-4000-8000-000000000001'),
  ('fe000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table first_guide_acknowledgement on commit drop as
select public.mark_discover_swipe_guide_seen_v1(
  'ff000000-0000-4000-8000-000000000001'
) as seen_at;
select ok(
  (select seen_at is not null from first_guide_acknowledgement),
  'the current user can acknowledge the Discover guide'
);
select is(
  (select discover_swipe_guide_seen_at from public.user_settings),
  (select seen_at from first_guide_acknowledgement),
  'the acknowledgement is stored on the current user settings row'
);
select is(
  public.mark_discover_swipe_guide_seen_v1(
    'ff000000-0000-4000-8000-000000000002'
  ),
  (select seen_at from first_guide_acknowledgement),
  'a replay preserves the original first-seen timestamp'
);
select is(
  (select count(*)::integer from public.user_settings
   where discover_swipe_guide_seen_at is not null),
  1,
  'one user acknowledgement cannot create duplicate settings state'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fe000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.user_settings
   where discover_swipe_guide_seen_at is not null),
  0,
  'another user cannot read the first user guide acknowledgement'
);
select lives_ok(
  $$select public.mark_discover_swipe_guide_seen_v1(
    'ff000000-0000-4000-8000-000000000003'
  )$$,
  'a second user can acknowledge only their own guide'
);

reset role;
select * from finish();
rollback;
