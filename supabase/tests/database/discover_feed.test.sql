begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'discoverer@test.local', 'test', now(), now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated', 'author@test.local', 'test', now(), now(), now());

insert into public.profiles (id, username, display_name, avatar_key)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'discoverer', 'Discoverer', 'trail'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'feed_author', 'Feed author', 'summit');

-- The local development seed deliberately exposes recommendation cards. Hide
-- pre-existing users inside this transaction so these assertions describe only
-- the explicit fixtures below and stay deterministic after seeding.
update public.profiles
set is_discoverable = false
where id not in (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
);

insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility, rarity,
  status, idempotency_key, cover_key, image_provider, completed_at, created_at
)
values
  ('20000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Public one', 'The first public feed item.', 'social', current_date, 'public', 'rare', 'completed', '60000000-0000-4000-8000-000000000001', 'social-rare-1', 'local-pixel', now(), now() - interval '2 minutes'),
  ('20000000-0000-4000-8000-000000000002', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Public two', 'The second public feed item.', 'travel', current_date, 'public', 'common', 'completed', '60000000-0000-4000-8000-000000000002', 'travel-common-1', 'local-pixel', now(), now() - interval '1 minute'),
  ('20000000-0000-4000-8000-000000000003', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Private item', 'This must stay out of discovery.', 'personal', current_date, 'private', 'common', 'completed', '60000000-0000-4000-8000-000000000003', 'personal-common-1', 'local-pixel', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.get_discover_feed_v2(24)),
  2,
  'discover returns only completed public achievements from other discoverable users'
);

select is(
  (select count(*)::integer from public.get_discover_feed_v2(1)),
  1,
  'discover respects a bounded round size'
);

select is(
  (select count(*)::integer from public.get_discover_feed_v2(24)),
  2,
  'v2 feed has no coordinate-bearing legacy return shape'
);

select is(
  (select liked from public.apply_discover_feedback_v2('20000000-0000-4000-8000-000000000002', 'like', '70000000-0000-4000-8000-000000000001')),
  true,
  'like action returns the canonical liked state'
);

select is(
  (select previous_liked from public.apply_discover_feedback_v2('20000000-0000-4000-8000-000000000001', 'skip', '70000000-0000-4000-8000-000000000002')),
  false,
  'feed action captures the like state before a mutation'
);

select is(
  (select count(*)::integer from public.get_discover_feed_v2(24)),
  0,
  'applied actions remove items from the current discover round'
);

select is(
  (select liked from public.undo_discover_feedback_v2('20000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001')),
  false,
  'undo restores the prior unliked state'
);

select is(
  (select count(*)::integer from public.likes where achievement_id = '20000000-0000-4000-8000-000000000002'),
  0,
  'undo removes the like introduced by the feed action'
);

select throws_ok(
  $$select * from public.undo_discover_feedback_v2('20000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'this feedback can no longer be undone',
  'a stale undo operation is rejected'
);

insert into public.likes (user_id, achievement_id)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '20000000-0000-4000-8000-000000000002');

select is(
  (select previous_liked from public.apply_discover_feedback_v2('20000000-0000-4000-8000-000000000002', 'not_for_me', '70000000-0000-4000-8000-000000000003')),
  true,
  'dislike remembers that an existing like predates the discover action'
);

select is(
  (select liked from public.undo_discover_feedback_v2('20000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000003')),
  true,
  'undo restores an existing like instead of deleting it'
);

select public.reset_discover_round();
select is(
  (select count(*)::integer from public.feed_actions where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0,
  'reset removes only round actions'
);

select * from finish();
rollback;
