begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('d1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rec-user@test.local', 'test', now(), now(), now()),
  ('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rec-author@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values
  ('d1000000-0000-4000-8000-000000000001', 'rec_user', 'Recommendation user', 'trail'),
  ('e1000000-0000-4000-8000-000000000001', 'rec_author', 'Recommendation author', 'summit');
insert into public.user_settings (user_id) values
  ('d1000000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000001');
update public.profiles set is_discoverable = false where id not in ('d1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001');
insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility,
  rarity, status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at
) values
  ('d2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Learn languages', 'A learning signal.', 'learning', current_date, 'public', 'rare', 'completed', 'completed', 'd3000000-0000-4000-8000-000000000001', 'learning-rare-1', 'local-pixel', now()),
  ('d2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'Build a trail', 'An adventure signal.', 'adventure', current_date, 'public', 'common', 'completed', 'completed', 'd3000000-0000-4000-8000-000000000002', 'adventure-common-1', 'local-pixel', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::integer from public.get_discover_feed_v2(10)), 2, 'v2 feed exposes valid public candidates');
create temporary table liked_feedback on commit drop as
select * from public.apply_discover_feedback_v2('d2000000-0000-4000-8000-000000000001', 'like', 'd4000000-0000-4000-8000-000000000001');
select is((select liked from liked_feedback), true, 'right-action equivalent likes the Patch');
select is((select category_score from liked_feedback), 3, 'like increases category preference');
select is((select count(*)::integer from public.get_discover_feed_v2(10)), 1, 'feedback removes Patch from current round');
select is((select count(*)::integer from public.recommendation_events), 1, 'feedback event is durable');

create temporary table dislike_feedback on commit drop as
select * from public.apply_discover_feedback_v2('d2000000-0000-4000-8000-000000000002', 'not_for_me', 'd4000000-0000-4000-8000-000000000002');
select is((select liked from dislike_feedback), false, 'not-for-me does not like the Patch');
select is((select category_score from dislike_feedback), -2, 'not-for-me lowers only its category score');
select is((select score from public.recommendation_category_scores where category = 'learning'), 3, 'unrelated category score survives');

create temporary table undone_feedback on commit drop as
select * from public.undo_discover_feedback_v2('d2000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002');
select is((select category_score from undone_feedback), 0, 'undo restores category score');
select is((select count(*)::integer from public.get_discover_feed_v2(10)), 1, 'undo restores the Patch to this round');
select lives_ok($$select public.reset_discover_round()$$, 'round reset succeeds');
select is((select count(*)::integer from public.get_discover_feed_v2(10)), 2, 'round reset restores candidates');
select is((select score from public.recommendation_category_scores where category = 'learning'), 3, 'round reset preserves durable preference');
select throws_ok($$select * from public.undo_discover_feedback_v2('d2000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002')$$, 'P0001', 'this feedback can no longer be undone', 'undo is idempotently rejected after completion');

reset role;
select * from finish();
rollback;
