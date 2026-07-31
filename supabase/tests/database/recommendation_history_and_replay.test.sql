begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('d1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'replay-viewer@test.local', 'test', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'replay-author-a@test.local', 'test', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'replay-author-b@test.local', 'test', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'replay-outsider@test.local', 'test', now(), now(), now());

insert into public.profiles (id, username, display_name, avatar_key, is_discoverable)
values
  ('d1000000-0000-4000-8000-000000000001', 'replay_viewer', 'Replay viewer', 'trail', false),
  ('d1000000-0000-4000-8000-000000000002', 'replay_author_a', 'Replay author A', 'summit', true),
  ('d1000000-0000-4000-8000-000000000003', 'replay_author_b', 'Replay author B', 'forest', true),
  ('d1000000-0000-4000-8000-000000000004', 'replay_outsider', 'Replay outsider', 'trail', false);
insert into public.user_settings (user_id)
select id from public.profiles
where id between 'd1000000-0000-4000-8000-000000000001' and 'd1000000-0000-4000-8000-000000000004';

insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility, rarity,
  status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at
) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'Replay one', 'First history Patch.', 'learning', current_date, 'public', 'common', 'completed', 'completed', 'd3000000-0000-4000-8000-000000000001', 'learning-common-1', 'local-pixel', now()),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000003', 'Replay two', 'Second history Patch.', 'learning', current_date, 'public', 'common', 'completed', 'completed', 'd3000000-0000-4000-8000-000000000002', 'learning-common-1', 'local-pixel', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table initial_fresh on commit drop as
select * from public.get_discover_feed_v5(null, 20, 0, 'fresh');
select ok(exists (
  select 1 from initial_fresh where id = 'd2000000-0000-4000-8000-000000000001'
), 'fresh round materializes an available Patch');

select lives_ok($$select public.record_discover_engagement_v2(
  'd2000000-0000-4000-8000-000000000001', 'impression',
  'd4000000-0000-4000-8000-000000000001'
)$$, 'a current-card impression is accepted');
select lives_ok($$select public.record_discover_engagement_v2(
  'd2000000-0000-4000-8000-000000000002', 'impression',
  'd4000000-0000-4000-8000-000000000002'
)$$, 'a second current-card impression is accepted');
select lives_ok($$select public.record_discover_engagement_v2(
  'd2000000-0000-4000-8000-000000000002', 'impression',
  'd4000000-0000-4000-8000-000000000002'
)$$, 'an impression operation can be retried idempotently');
select is(
  (select count(*)::integer from public.recommendation_engagement_events
   where user_id = 'd1000000-0000-4000-8000-000000000001' and event_type = 'impression'),
  2,
  'one operation id creates one history event'
);

create temporary table history_first_page on commit drop as
select * from public.get_recommendation_view_history_v1(1, null, null);
create temporary table history_second_page on commit drop as
select * from public.get_recommendation_view_history_v1(
  1,
  (select viewed_at from history_first_page),
  (select event_id from history_first_page)
);
select is((select count(*)::integer from history_first_page), 1, 'history has a bounded first cursor page');
select ok(not exists (
  select 1 from history_first_page first_page
  join history_second_page second_page on second_page.event_id = first_page.event_id
), 'history cursor never repeats an event');

select lives_ok($$select public.apply_discover_feedback_v3(
  'd2000000-0000-4000-8000-000000000001', 'skip',
  'd5000000-0000-4000-8000-000000000001'
)$$, 'initial skip is accepted');
select lives_ok($$select public.apply_discover_feedback_v3(
  'd2000000-0000-4000-8000-000000000001', 'like',
  'd5000000-0000-4000-8000-000000000002'
)$$, 'replay feedback can replace a previous action');
select is(
  (select score from public.recommendation_category_scores
   where user_id = 'd1000000-0000-4000-8000-000000000001' and category = 'learning'),
  3,
  'replacement feedback applies only the action-weight difference'
);
select is(
  (select category_score from public.apply_discover_feedback_v3(
    'd2000000-0000-4000-8000-000000000001', 'like',
    'd5000000-0000-4000-8000-000000000002'
  )),
  3,
  'repeating an operation id does not inflate preference score'
);
select lives_ok($$select public.undo_discover_feedback_v3(
  'd2000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000002'
)$$, 'feedback undo restores its previous action');
select is(
  (select action::text from public.feed_actions
   where user_id = 'd1000000-0000-4000-8000-000000000001'
     and achievement_id = 'd2000000-0000-4000-8000-000000000001'),
  'skip',
  'undo restores the previous feed action instead of clearing history'
);
select public.start_discover_round_v2('fresh');
create temporary table fresh_after_skip on commit drop as
select * from public.get_discover_feed_v5(null, 20, 0, 'fresh');
select ok(not exists (
  select 1 from fresh_after_skip where id = 'd2000000-0000-4000-8000-000000000001'
), 'fresh rounds do not return previously processed cards');
select lives_ok($$select public.apply_discover_feedback_v3(
  'd2000000-0000-4000-8000-000000000002', 'not_for_me',
  'd5000000-0000-4000-8000-000000000003'
)$$, 'a durable not-for-me action is accepted');
select public.start_discover_round_v2('replay');
create temporary table replay_page on commit drop as
select * from public.get_discover_feed_v5(null, 20, 0, 'replay');
select ok(not exists (
  select 1 from replay_page where id = 'd2000000-0000-4000-8000-000000000002'
), 'replay excludes explicit not-for-me Patches');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from public.get_recommendation_view_history_v1(30, null, null)), 0, 'another account cannot read viewing history');

reset role;
delete from auth.users where id = 'd1000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.recommendation_engagement_events
   where user_id = 'd1000000-0000-4000-8000-000000000001'),
  0,
  'deleting an account cascades its durable history'
);

select * from finish();
rollback;
