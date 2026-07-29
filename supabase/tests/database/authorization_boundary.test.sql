begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(29);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated cannot insert profiles directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievements', 'INSERT'),
  'authenticated cannot insert Patches directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievement_generation_jobs', 'INSERT'),
  'authenticated cannot insert generation jobs directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.visited_countries', 'INSERT'),
  'authenticated cannot insert travel rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievements', 'DELETE'),
  'authenticated cannot hard-delete Patches directly'
);
select ok(
  not has_function_privilege(
    'public',
    'public.claim_achievement_generation_jobs(integer, text, integer)',
    'EXECUTE'
  ),
  'PUBLIC cannot execute the generation worker claim RPC'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('d4000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'boundary-alpha@test.local', 'test', now(), now(), now()),
  ('d4000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'boundary-bravo@test.local', 'test', now(), now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.profiles (id, username, display_name, avatar_key, achievement_count, total_received_likes, friend_count)
    values ('d4000000-0000-4000-8000-000000000001', 'forged_alpha', 'Forged Alpha', 'trail', 999, 888, 777)$$,
  '42501',
  'permission denied for table profiles',
  'client cannot forge profile counters during insertion'
);
select lives_ok(
  $$select public.complete_onboarding_v1('boundary_alpha', 'Boundary Alpha')$$,
  'atomic onboarding creates a profile and settings through one RPC'
);
select is(
  (select count(*)::integer from public.profiles where id = auth.uid()
    and achievement_count = 0 and total_received_likes = 0 and friend_count = 0),
  1,
  'onboarding cannot accept forged server-owned counters'
);
select is(
  (select count(*)::integer from public.user_settings where user_id = auth.uid()),
  1,
  'onboarding always creates settings'
);
select lives_ok(
  $$select public.complete_onboarding_v1('boundary_alpha', 'Changed client input is ignored on retry')$$,
  'onboarding replay is idempotent'
);
select is(
  (select count(*)::integer from public.profiles where id = auth.uid()),
  1,
  'onboarding replay cannot duplicate a profile'
);
select lives_ok(
  $$update public.profiles set bio = 'An allowed authored profile field.' where id = auth.uid()$$,
  'an owner can still update an allowed authored profile field'
);

select lives_ok(
  $$select * from public.create_patch_v2(
    'Boundary Patch', 'Created only through the protected Patch RPC.', 'social', 'rare',
    'private', 'completed', current_date, null, 'd5000000-0000-4000-8000-000000000001'
  )$$,
  'the protected Patch RPC remains usable after direct writes are revoked'
);
select throws_ok(
  $$insert into public.achievements (
    id, owner_id, title, description, category, achievement_date, visibility,
    rarity, status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at
  ) values (
    'd6000000-0000-4000-8000-000000000001', auth.uid(), 'Forged Patch',
    'A direct authenticated insert must be rejected.', 'social', current_date, 'private',
    'rare', 'processing', 'completed', 'd7000000-0000-4000-8000-000000000001',
    'forged-patch', 'forged-provider', now()
  )$$,
  '42501',
  'permission denied for table achievements',
  'direct Patch insertion is rejected'
);
select throws_ok(
  $$insert into public.achievement_generation_jobs (achievement_id, owner_id, provider, status, attempt)
    values (
      (select id from public.achievements where idempotency_key = 'd5000000-0000-4000-8000-000000000001'),
      auth.uid(), 'forged-provider', 'queued', 3
    )$$,
  '42501',
  'permission denied for table achievement_generation_jobs',
  'direct generation-job insertion is rejected'
);
select throws_ok(
  $$update public.achievements set achievement_date = current_date + 1
    where idempotency_key = 'd5000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table achievements',
  'direct future Patch dates are rejected'
);
select throws_ok(
  $$delete from public.achievements where idempotency_key = 'd5000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table achievements',
  'direct Patch hard deletion is rejected'
);
select throws_ok(
  $$insert into public.visited_countries (user_id, country_code, country_name, status)
    values (auth.uid(), 'ZZ', 'Invalid Country', 'visited')$$,
  '42501',
  'permission denied for table visited_countries',
  'direct invalid country insertion is rejected'
);
select throws_ok(
  $$select * from public.set_country_visit_v2(
    'ZZ', 'Invalid Country', 'visited', null, null, null,
    'd8000000-0000-4000-8000-000000000001'
  )$$,
  '23514',
  'invalid country',
  'travel RPC rejects country codes outside the database catalog'
);
select lives_ok(
  $$select * from public.set_country_visit_v2(
    'CZ', 'Czechia', 'visited', null, null, null,
    'd8000000-0000-4000-8000-000000000002'
  )$$,
  'travel RPC accepts a catalog country code'
);
select lives_ok(
  $$select * from public.mark_patch_collection_viewed(
    (select id from public.achievements where idempotency_key = 'd5000000-0000-4000-8000-000000000001')
  )$$,
  'collection viewed state is written through a protected RPC'
);
select ok(
  (select collection_viewed_at is not null from public.achievements
    where idempotency_key = 'd5000000-0000-4000-8000-000000000001'),
  'collection viewed state persists'
);
select lives_ok(
  $$select public.mark_patch_reveal_viewed(
    (select id from public.achievements where idempotency_key = 'd5000000-0000-4000-8000-000000000001')
  )$$,
  'reveal viewed state is written through a protected RPC'
);
select ok(
  (select reveal_viewed_at is not null from public.achievements
    where idempotency_key = 'd5000000-0000-4000-8000-000000000001'),
  'reveal viewed state persists'
);

select set_config('request.jwt.claims', '{}', true);
set local role anon;
select throws_ok(
  $$select * from public.claim_achievement_generation_jobs(1, 'anon-worker', 60)$$,
  '42501',
  'permission denied for function claim_achievement_generation_jobs',
  'anonymous callers cannot execute the generation worker RPC'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.claim_achievement_generation_jobs(1, 'client-worker', 60)$$,
  '42501',
  'permission denied for function claim_achievement_generation_jobs',
  'authenticated callers cannot execute the generation worker RPC'
);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select * from public.claim_achievement_generation_jobs(1, 'test-worker', 60)$$,
  'service role can execute the generation worker RPC'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.complete_onboarding_v1('boundary_alpha', 'Boundary Bravo')$$,
  'P0001',
  'username_taken',
  'username conflicts return the stable onboarding error code'
);

reset role;
select * from finish();
rollback;
