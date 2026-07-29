begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'round-user@test.local', 'test', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'round-author-a@test.local', 'test', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'round-author-b@test.local', 'test', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'round-author-c@test.local', 'test', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'round-author-d@test.local', 'test', now(), now(), now());

insert into public.profiles (id, username, display_name, avatar_key)
values
  ('f1000000-0000-4000-8000-000000000001', 'round_user', 'Round user', 'trail'),
  ('f1000000-0000-4000-8000-000000000002', 'round_author_a', 'Round author A', 'trail'),
  ('f1000000-0000-4000-8000-000000000003', 'round_author_b', 'Round author B', 'trail'),
  ('f1000000-0000-4000-8000-000000000004', 'round_author_c', 'Round author C', 'trail'),
  ('f1000000-0000-4000-8000-000000000005', 'round_author_d', 'Round author D', 'trail');
insert into public.user_settings (user_id)
select id from public.profiles where id between 'f1000000-0000-4000-8000-000000000001' and 'f1000000-0000-4000-8000-000000000005';

update public.profiles
set is_discoverable = false
where id not between 'f1000000-0000-4000-8000-000000000002' and 'f1000000-0000-4000-8000-000000000005';

insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility, rarity,
  status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at
) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'Round social', 'A social Patch.', 'social', current_date, 'public', 'common', 'completed', 'completed', 'f3000000-0000-4000-8000-000000000001', 'social-common-1', 'local-pixel', now()),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'Round learning', 'A learning Patch.', 'learning', current_date, 'public', 'common', 'completed', 'completed', 'f3000000-0000-4000-8000-000000000002', 'learning-common-1', 'local-pixel', now()),
  ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004', 'Round travel', 'A travel Patch.', 'travel', current_date, 'public', 'common', 'completed', 'completed', 'f3000000-0000-4000-8000-000000000003', 'travel-common-1', 'local-pixel', now()),
  ('f2000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000005', 'Round health', 'A health Patch.', 'health', current_date, 'public', 'common', 'completed', 'completed', 'f3000000-0000-4000-8000-000000000004', 'health-common-1', 'local-pixel', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table first_page on commit drop as
select * from public.get_discover_feed_v4(null, 2, 0);

select is((select count(*)::integer from first_page), 2, 'first page is bounded');
select is((select count(distinct round_id)::integer from first_page), 1, 'first page belongs to one stable round');
select ok(not exists (
  select 1 from first_page first_card
  join first_page second_card on first_card.rank < second_card.rank
  where first_card.category = second_card.category
), 'the round does not repeat a category while alternatives exist');
select ok(not exists (
  select 1 from first_page first_card
  join first_page second_card on first_card.rank < second_card.rank
  where first_card.owner_id = second_card.owner_id
), 'the round does not repeat an author while alternatives exist');

create temporary table repeated_page on commit drop as
select * from public.get_discover_feed_v4((select round_id from first_page limit 1), 2, 0);
select is((select id from repeated_page order by rank limit 1), (select id from first_page order by rank limit 1), 'reopening a round keeps its first recommendation stable');

create temporary table second_page on commit drop as
select * from public.get_discover_feed_v4(
  (select round_id from first_page limit 1),
  2,
  (select max(rank) from first_page)
);
select is((select count(*)::integer from second_page), 2, 'the next cursor page returns the remainder');
select ok(not exists (
  select 1 from first_page first_card
  join second_page second_card on second_card.id = first_card.id
), 'cursor pages do not repeat recommendations');

select lives_ok(
  $$select public.record_discover_engagement_v1(
    (select id from first_page order by rank limit 1),
    'profile_open',
    null,
    'f4000000-0000-4000-8000-000000000001'
  )$$,
  'profile opening is recorded as a durable recommendation signal'
);
select is(
  (select score from public.recommendation_author_scores
   where user_id = 'f1000000-0000-4000-8000-000000000001'
     and author_id = (select owner_id from first_page order by rank limit 1)),
  2,
  'profile opening increases the author affinity'
);
select is(
  (select count(*)::integer from public.recommendation_engagement_events),
  1,
  'engagement is persisted without Patch text'
);

select public.reset_discover_round();
select is(
  (select count(*)::integer from public.recommendation_rounds
   where user_id = 'f1000000-0000-4000-8000-000000000001' and closed_at is not null),
  1,
  'reset closes the old stable round before a new one can be created'
);

reset role;
select * from finish();
rollback;
