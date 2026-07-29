begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'safety-a@test.local', 'test', now(), now(), now()),
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'safety-b@test.local', 'test', now(), now(), now()),
  ('c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'safety-c@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values
  ('a1000000-0000-4000-8000-000000000001', 'safety_alice', 'Safety Alice', 'trail'),
  ('b1000000-0000-4000-8000-000000000001', 'safety_bob', 'Safety Bob', 'summit'),
  ('c1000000-0000-4000-8000-000000000001', 'safety_cara', 'Safety Cara', 'river');
insert into public.user_settings (user_id)
values
  ('a1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001');
insert into public.achievements (
  id, owner_id, title, description, category, achievement_date, visibility,
  rarity, status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at
) values (
  'a2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Bob public Patch', 'A visible Patch used to prove block enforcement.', 'social', current_date,
  'public', 'rare', 'completed', 'completed', 'a3000000-0000-4000-8000-000000000001',
  'social-rare-1', 'local-pixel', now()
);
insert into public.achievement_events (
  achievement_id, owner_id, operation_id, kind, event_date, moderation_status
) values
  ('a2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000011', 'note', current_date, 'under_review'),
  ('a2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000012', 'note', current_date, 'hidden'),
  ('a2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000013', 'note', current_date, 'removed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::integer from public.achievements where id = 'a2000000-0000-4000-8000-000000000001'), 1, 'public Patch is initially visible');
select is((select count(*)::integer from public.achievement_events where achievement_id = 'a2000000-0000-4000-8000-000000000001'), 0, 'non-owner cannot read under-review, hidden, or removed event history');
select throws_ok($$update public.profiles set achievement_count = 999999 where id = 'a1000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table profiles', 'client cannot write an authoritative Patch counter');
select throws_ok($$update public.profiles set total_received_likes = 999999 where id = 'a1000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table profiles', 'client cannot write an authoritative like counter');
select throws_ok($$update public.profiles set friend_count = 999999 where id = 'a1000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table profiles', 'client cannot write an authoritative friend counter');
select lives_ok($$update public.profiles set bio = 'A safe profile bio.' where id = 'a1000000-0000-4000-8000-000000000001'$$, 'client may update the authored bio column');
select lives_ok($$select public.block_user('b1000000-0000-4000-8000-000000000001')$$, 'owner can block another user');
select is((select count(*)::integer from public.achievements where id = 'a2000000-0000-4000-8000-000000000001'), 0, 'blocked author Patch disappears through RLS');
select is((select count(*)::integer from public.get_blocked_users_v2()), 1, 'blocker can review their blocked user without bypassing profile RLS');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select * from public.get_blocked_users_v2()$$, '42501', 'authentication required', 'blocked-user projection rejects unauthenticated access');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select * from public.toggle_achievement_like('a2000000-0000-4000-8000-000000000001', true)$$, '42501', 'Patch is unavailable', 'blocked content cannot be liked through RPC');
select throws_ok($$select public.create_friend_request('b1000000-0000-4000-8000-000000000001')$$, '42501', 'this profile is unavailable', 'blocked user cannot receive a friend request');
select lives_ok($$select public.report_content('b1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'spam', 'unsafe example')$$, 'report RPC records a bounded report');
select is((select count(*)::integer from public.content_reports), 1, 'report is stored server-side');

select lives_ok($$select public.create_friend_request('c1000000-0000-4000-8000-000000000001')$$, 'unblocked profile can receive a request');
select is(public.get_friendship_state('c1000000-0000-4000-8000-000000000001'), 'outgoing', 'requester sees outgoing state');

select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.notifications where owner_id = 'c1000000-0000-4000-8000-000000000001' and type = 'friend_request'), 1, 'request creates one in-app notification');
select is(public.get_friendship_state('a1000000-0000-4000-8000-000000000001'), 'incoming', 'addressee sees incoming state');
select is(public.respond_to_friend_request('a1000000-0000-4000-8000-000000000001', true)::text, 'accepted', 'incoming request can be accepted');
select is(public.get_friendship_state('a1000000-0000-4000-8000-000000000001'), 'friends', 'accepted friendship is mutual');
select is((select friend_count from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'), 1, 'requester profile gets an authoritative friend count');
select is((select friend_count from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'), 1, 'addressee profile gets an authoritative friend count');
select is((select count(*)::integer from public.get_friends_v2('friends')), 1, 'friends list returns accepted friendship');
select is((select count(*)::integer from public.search_profiles('safety', 20)), 2, 'profile search excludes self without leaking email');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.notifications where owner_id = 'a1000000-0000-4000-8000-000000000001' and type = 'friend_accepted'), 1, 'acceptance creates one in-app notification');
select is((select count(*)::integer from public.search_profiles('safety', 20)), 1, 'profile search excludes the user Alice blocked');

reset role;
select * from finish();
rollback;
