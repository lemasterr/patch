begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('fa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'impression-viewer@test.local', 'test', now(), now(), now()),
  ('fa000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'impression-author@test.local', 'test', now(), now(), now()),
  ('fa000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'impression-outsider@test.local', 'test', now(), now(), now());

insert into public.profiles (id, username, display_name, avatar_key)
values
  ('fa000000-0000-4000-8000-000000000001', 'impression_viewer', 'Impression viewer', 'trail'),
  ('fa000000-0000-4000-8000-000000000002', 'impression_author', 'Impression author', 'summit'),
  ('fa000000-0000-4000-8000-000000000003', 'impression_outsider', 'Impression outsider', 'forest');
insert into public.user_settings (user_id)
select id from public.profiles
where id between 'fa000000-0000-4000-8000-000000000001' and 'fa000000-0000-4000-8000-000000000003';
update public.profiles
set is_discoverable = false
where id not in (
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002',
  'fa000000-0000-4000-8000-000000000003'
);

insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility, rarity,
  status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at
) values (
  'fb000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002',
  'Visible impression Patch',
  'A public Patch used only for impression testing.',
  'learning', current_date, 'public', 'common', 'completed', 'completed',
  'fc000000-0000-4000-8000-000000000001', 'learning-common-1', 'local-pixel', now()
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table impression_feed on commit drop as
select * from public.get_discover_feed_v4(null, 10, 0);
select is((select count(*)::integer from impression_feed), 1, 'the public Patch enters a stable Discover round');

select lives_ok(
  $$select public.record_discover_engagement_v1(
    'fb000000-0000-4000-8000-000000000001', 'view', 1800,
    'fd000000-0000-4000-8000-000000000001'
  )$$,
  'a qualifying card view records an impression'
);
select lives_ok(
  $$select public.record_discover_engagement_v1(
    'fb000000-0000-4000-8000-000000000001', 'view', 1800,
    'fd000000-0000-4000-8000-000000000001'
  )$$,
  'a replayed view operation is idempotent'
);
select is(
  (select count(*)::integer from public.recommendation_impressions),
  1,
  'one viewer-Patch row records passive viewing separately from feedback'
);
select is(
  (select view_count from public.recommendation_impressions),
  1,
  'an idempotent replay does not inflate the view count'
);
select is(
  (select last_round_id from public.recommendation_impressions),
  (select round_id from impression_feed),
  'the impression retains its source round without Patch text'
);
select lives_ok($$select public.advance_discover_round_v1()$$, 'a Discover round can be advanced');
select is(
  (select count(*)::integer from public.recommendation_impressions),
  1,
  'advancing a round does not delete view history'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.recommendation_impressions), 0, 'another account cannot read a viewer impression history');

reset role;
select * from finish();
rollback;
