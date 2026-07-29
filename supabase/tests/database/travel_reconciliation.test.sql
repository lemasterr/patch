begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('a9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'travel-v2@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values ('a9000000-0000-4000-8000-000000000001', 'travel_v2', 'Travel v2', 'trail');
insert into public.user_settings (user_id) values ('a9000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.set_country_visit_v2('AD', 'Andorra', 'visited', null, null, null, 'a9100000-0000-4000-8000-000000000001')$$, 'adding a country reconciles world Patches');
select is((select cardinality(active_patch_ids) from public.set_country_visit_v2('AD', 'Andorra', 'visited', null, null, null, 'a9100000-0000-4000-8000-000000000001')), 0, 'replayed country operation returns no historical rewards');
select is((select count(*)::integer from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_kind = 'country' and revoked_at is null), 1, 'country Patch is active');
select lives_ok($$select public.update_system_travel_patch((select id from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_key = 'country:AD'), 'Custom travel memory.', current_date - 1, 'a9100000-0000-4000-8000-000000000002')$$, 'system Patch supports only its sanctioned customisation');
select is((select description from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_key = 'country:AD'), 'Custom travel memory.', 'custom description is stored');
select lives_ok($$select public.set_country_visit_v2('AL', 'Albania', 'visited', null, null, null, 'a9100000-0000-4000-8000-000000000003')$$, 'second country can be added');
select lives_ok($$select public.set_country_visit_v2('AT', 'Austria', 'visited', null, null, null, 'a9100000-0000-4000-8000-000000000004')$$, 'third country can be added');
select lives_ok($$select public.set_country_visit_v2('BA', 'Bosnia and Herzegovina', 'visited', null, null, null, 'a9100000-0000-4000-8000-000000000005')$$, 'fourth country can be added');
select lives_ok($$select public.set_country_visit_v2('BE', 'Belgium', 'visited', null, null, null, 'a9100000-0000-4000-8000-000000000006')$$, 'fifth country can be added');
select is((select cardinality(active_patch_ids) from public.set_country_visit_v2('BE', 'Belgium', 'visited', null, null, null, 'a9100000-0000-4000-8000-000000000006')), 0, 'replayed milestone operation returns no historical rewards');
select is((select count(*)::integer from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_key = 'country_milestone:5' and revoked_at is null), 1, 'fifth country activates milestone');
select lives_ok($$select public.remove_country_visit_v2('BE', 'a9100000-0000-4000-8000-000000000007')$$, 'removing a country uses safe RPC');
select is((select count(*)::integer from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_key = 'country:BE' and revoked_at is not null), 1, 'removed country Patch is revoked instead of deleted');
select is((select lifecycle_status::text from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_key = 'country_milestone:5'), 'locked', 'milestone relocks below its threshold');
select lives_ok($$select public.set_country_visit_v2('BE', 'Belgium', 'visited', null, null, null, 'a9100000-0000-4000-8000-000000000008')$$, 're-adding a country reconciles again');
select is((select count(*)::integer from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_key = 'country:BE'), 1, 're-adding keeps the same country row without duplicate');
select is((select description from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_key = 'country:AD'), 'Custom travel memory.', 'override survives later reconciliations');
select lives_ok($$select public.set_country_visit_v2('AD', 'Andorra', 'wishlist', null, null, null, 'a9100000-0000-4000-8000-000000000009')$$, 'wishlist update is accepted');
select is((select count(*)::integer from public.achievements where owner_id = 'a9000000-0000-4000-8000-000000000001' and source_key = 'country:AD' and revoked_at is not null), 1, 'wishlist does not count as visited');
select is((select cardinality(active_patch_ids) from public.set_country_visit_v2('AD', 'Andorra', 'wishlist', null, null, null, 'a9100000-0000-4000-8000-000000000009')), 0, 'wishlist replay also reports no old reward');

reset role;
select * from finish();
rollback;
