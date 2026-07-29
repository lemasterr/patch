begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(58);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'achievements', 'achievements table exists');
select has_table('public', 'achievement_generation_jobs', 'generation jobs table exists');
select has_table('public', 'likes', 'likes table exists');
select has_table('public', 'notifications', 'notifications table exists');
select has_table('public', 'feed_actions', 'feed actions table exists');
select has_table('public', 'user_settings', 'settings table exists');
select has_table('public', 'visited_countries', 'visited countries table exists');

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('profiles', 'achievements', 'achievement_generation_jobs', 'likes', 'notifications', 'feed_actions', 'user_settings', 'visited_countries')),
  'RLS is enabled on every exposed application table'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'alpha@test.local', 'test', now(), now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bravo@test.local', 'test', now(), now(), now());

insert into public.profiles (id, username, display_name, avatar_key)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alpha_user', 'Alpha', 'trail'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bravo_user', 'Bravo', 'summit');
insert into public.user_settings (user_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility, rarity,
  status, idempotency_key, cover_key, image_provider, completed_at
) values
  ('10000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Public moment', 'Visible to other travelers.', 'social', current_date, 'public', 'rare', 'completed', '30000000-0000-4000-8000-000000000001', 'social-rare-1', 'local-pixel', now()),
  ('10000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Private moment', 'Visible only to its owner.', 'personal', current_date, 'private', 'common', 'completed', '30000000-0000-4000-8000-000000000002', 'personal-common-1', 'local-pixel', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

-- Collection viewing is owner-only and is deliberately separate from reveal
-- viewing. It is nullable for newly created achievements.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
update public.achievements
set collection_viewed_at = now()
where id = '10000000-0000-4000-8000-000000000001';
select ok(
  (select collection_viewed_at is not null from public.achievements where id = '10000000-0000-4000-8000-000000000001'),
  'an owner can mark their achievement viewed in Collection'
);
select public.set_patch_hidden(
  '10000000-0000-4000-8000-000000000001', true,
  '20000000-0000-4000-8000-000000000001'
);
select is(
  (select count(*)::integer from public.get_hidden_collection_v2('completed', null, null, 'newest', 80)),
  1,
  'hidden collection returns only the owner hidden Patch'
);
select is(
  (select count(*)::integer from public.get_collection_v2('completed', null, null, 'newest', false, 80)),
  1,
  'normal collection excludes a hidden Patch'
);
select public.set_patch_hidden(
  '10000000-0000-4000-8000-000000000001', false,
  '20000000-0000-4000-8000-000000000002'
);
select is(
  (select count(*)::integer from public.achievements where id = '10000000-0000-4000-8000-000000000001' and collection_viewed_at is not null),
  1,
  'collection viewed timestamp persists'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
update public.achievements
set collection_viewed_at = null
where id = '10000000-0000-4000-8000-000000000001';
select ok(
  (select collection_viewed_at is not null from public.achievements where id = '10000000-0000-4000-8000-000000000001'),
  'another user cannot change a collection viewed timestamp'
);

insert into public.visited_countries (user_id, country_code, country_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CZ', 'Czechia');
select is((select count(*)::integer from public.visited_countries where country_code = 'CZ'), 1, 'a user can mark their own country visited');
select is((select count(*)::integer from public.achievements where title = 'Visited Czechia'), 1, 'visiting a country grants a country achievement');
select is((select count(*)::integer from public.achievements where idempotency_key = md5('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:country-count')::uuid), 0, 'one country does not create the obsolete aggregate achievement');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::integer from public.visited_countries where country_code = 'CZ'), 0, 'visited countries are private to their owner');
insert into public.visited_countries (user_id, country_code, country_name, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'AT', 'Austria', 'wishlist');
select is((select count(*)::integer from public.achievements where owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and cover_key = 'country-at'), 0, 'a wishlist alone does not grant a country achievement');
delete from public.visited_countries where country_code = 'AT';
select is((select count(*)::integer from public.get_public_profile_map('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 0, 'public map RPC never exposes a private journal');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
update public.visited_countries set visited_at = current_date - 1 where country_code = 'CZ';
select is((select visited_at from public.visited_countries where country_code = 'CZ'), current_date - 1, 'a user can update their own visit date');
update public.visited_countries set status = 'lived' where country_code = 'CZ';
select is((select status::text from public.visited_countries where country_code = 'CZ'), 'lived', 'a user can assign a country status');
select is((select count(*)::integer from public.visited_countries where country_code = 'CZ'), 1, 'lived does not duplicate a country');
do $$ begin
  perform public.set_country_visit('CZ', 'Czechia', 'lived', 7, 2026, 'Home base');
end $$;
select is((select visit_month::integer from public.visited_countries where country_code = 'CZ'), 7, 'country journal stores an optional month');
select is((select note from public.visited_countries where country_code = 'CZ'), 'Home base', 'country journal stores a short note');
insert into public.visited_countries (user_id, country_code, country_name, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AT', 'Austria', 'visited'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DE', 'Germany', 'visited'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'FR', 'France', 'visited'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'IT', 'Italy', 'visited');
select is((select count(*)::integer from public.achievements where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and cover_key = 'country-milestone-5'), 1, 'the fifth explored country grants milestone 5');
update public.visited_countries set status = 'lived' where country_code = 'IT';
select is((select count(*)::integer from public.achievements where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and cover_key = 'country-milestone-5'), 1, 'status changes do not duplicate milestones');
delete from public.visited_countries where country_code = 'CZ';
select is((select count(*)::integer from public.visited_countries where country_code = 'CZ'), 0, 'a user can remove their own visited country');
select is((select count(*)::integer from public.achievements where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and cover_key = 'country-milestone-5'), 1, 'earned milestones remain after a country is removed');

select public.record_feed_action('10000000-0000-4000-8000-000000000001', 'dislike');
select is((select action::text from public.feed_actions where achievement_id = '10000000-0000-4000-8000-000000000001'), 'dislike', 'dislike is recorded separately from skip');

select is((select count(*)::integer from public.achievements where id = '10000000-0000-4000-8000-000000000001'), 1, 'completed public achievement is visible');
select is((select count(*)::integer from public.achievements where id = '10000000-0000-4000-8000-000000000002'), 0, 'another user private achievement is hidden');

do $$ begin
  perform public.create_patch_v2(
    'Idempotent moment', 'Created once even after a duplicate submit.', 'everyday', 'rare',
    'private', 'completed', current_date, null, '40000000-0000-4000-8000-000000000001'
  );
  perform public.create_patch_v2(
    'Idempotent moment', 'Created once even after a duplicate submit.', 'everyday', 'rare',
    'private', 'completed', current_date, null, '40000000-0000-4000-8000-000000000001'
  );
end $$;

select is((select count(*)::integer from public.achievements where idempotency_key = '40000000-0000-4000-8000-000000000001'), 1, 'duplicate submission creates one achievement');
select is((select count(*)::integer from public.achievement_generation_jobs j join public.achievements a on a.id = j.achievement_id where a.idempotency_key = '40000000-0000-4000-8000-000000000001'), 1, 'duplicate submission creates one generation job');
select is((select status::text from public.achievements where idempotency_key = '40000000-0000-4000-8000-000000000001'), 'processing', 'new achievement starts processing');

do $$ begin
  perform public.create_patch_v2(
    'Native moment', 'Created through the native queue.', 'travel', 'common',
    'private', 'completed', current_date, null, '50000000-0000-4000-8000-000000000001'
  );
end $$;
select is((select status::text from public.achievements where idempotency_key = '50000000-0000-4000-8000-000000000001'), 'processing', 'native creation enters the durable generation queue');
select is((select j.status::text from public.achievement_generation_jobs j join public.achievements a on a.id = j.achievement_id where a.idempotency_key = '50000000-0000-4000-8000-000000000001'), 'queued', 'native creation has a queued generation job');
select ok((select collection_viewed_at is null from public.achievements where idempotency_key = '50000000-0000-4000-8000-000000000001'), 'new achievements begin unviewed in Collection');

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table claimed_generation_job on commit drop as
select * from public.claim_achievement_generation_jobs(1, 'legacy-pgtap', 60);
select is((select count(*)::integer from claimed_generation_job), 1, 'the worker claims one queued generation job');
reset role;
select is((select j.status::text from public.achievement_generation_jobs j where j.id = (select job_id from claimed_generation_job)), 'running', 'claiming a job locks it as running');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select public.complete_achievement_generation_job(job_id, lease_token, 'everyday-common-worker', 'patch-deterministic') from claimed_generation_job),
  (select achievement_id from claimed_generation_job),
  'the worker completes its claimed achievement'
);
reset role;
select is((select a.status::text from public.achievements a where a.id = (select achievement_id from claimed_generation_job)), 'completed', 'completion updates the achievement lifecycle');
select is((select count(*)::integer from public.notifications n where n.dedupe_key = 'achievement-completed:' || (select achievement_id::text from claimed_generation_job)), 1, 'completion writes one deduplicated notification');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table failed_generation_job on commit drop as
select * from public.claim_achievement_generation_jobs(1, 'legacy-pgtap', 60);
grant select on table failed_generation_job to authenticated;
select is((select count(*)::integer from failed_generation_job), 1, 'the worker can claim a second queued job');
select is(
  (select public.fail_achievement_generation_job(job_id, lease_token, 'test provider failure', false) from failed_generation_job),
  (select achievement_id from failed_generation_job),
  'the worker records a final provider failure'
);
reset role;
select is((select a.status::text from public.achievements a where a.id = (select achievement_id from failed_generation_job)), 'failed', 'a final worker failure updates the achievement lifecycle');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select ok(
  (select public.retry_achievement_generation(achievement_id) is not null from failed_generation_job),
  'the owner can retry a failed generation below the attempt limit'
);
select is((select a.status::text from public.achievements a where a.id = (select achievement_id from failed_generation_job)), 'processing', 'retry returns the achievement to processing');

do $$ begin
  perform public.toggle_achievement_like('10000000-0000-4000-8000-000000000001', true);
  perform public.toggle_achievement_like('10000000-0000-4000-8000-000000000001', true);
end $$;
select is((select count(*)::integer from public.likes where achievement_id = '10000000-0000-4000-8000-000000000001'), 1, 'duplicate like is prevented');
select is((select like_count from public.achievements where id = '10000000-0000-4000-8000-000000000001'), 1, 'like count is server authoritative');

reset role;
select set_config('request.jwt.claims', '{}', true);
select is((select total_received_likes from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1, 'received-like profile counter is maintained');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::integer from public.notifications where type = 'achievement_liked'), 1, 'a like notification is created for the owner');
update public.notifications set read_at = now() where type = 'achievement_liked';
select ok((select read_at is not null from public.notifications where type = 'achievement_liked'), 'notification can be marked read by its owner');
update public.achievements set reveal_viewed_at = now() where id = '10000000-0000-4000-8000-000000000001';
select ok((select reveal_viewed_at is not null from public.achievements where id = '10000000-0000-4000-8000-000000000001'), 'reveal viewed state persists');

reset role;
select set_config('request.jwt.claims', '{}', true);
select is((select achievement_count from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 2, 'completed achievement counter is maintained');
select throws_ok(
  $$update public.achievements set status = 'draft' where id = '10000000-0000-4000-8000-000000000001'$$,
  '23514',
  'invalid achievement status transition from completed to draft',
  'invalid lifecycle transition is rejected'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
do $$ begin perform public.toggle_achievement_like('10000000-0000-4000-8000-000000000001', false); end $$;
select is((select like_count from public.achievements where id = '10000000-0000-4000-8000-000000000001'), 0, 'unlike updates the authoritative count');
select is((select count(*)::integer from public.likes where achievement_id = '10000000-0000-4000-8000-000000000001'), 0, 'unlike removes the like row');

select * from finish();
rollback;
