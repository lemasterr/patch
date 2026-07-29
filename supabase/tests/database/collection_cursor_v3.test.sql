begin;

set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'collection-cursor@test.local', 'test', now(), now(), now());
insert into public.profiles (id, username, display_name, avatar_key)
values ('a1000000-0000-4000-8000-000000000001', 'collection_cursor', 'Collection cursor', 'trail');
insert into public.user_settings (user_id) values ('a1000000-0000-4000-8000-000000000001');

insert into public.achievements (
  owner_id, title, description, category, achievement_date, visibility, rarity,
  status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at, created_at
)
select
  'a1000000-0000-4000-8000-000000000001',
  'Cursor Patch ' || value,
  'Searchable collection cursor item ' || value,
  'learning', current_date, 'public', 'common', 'completed', 'completed',
  gen_random_uuid(), 'learning-common-1', 'local-pixel', now(), now() - (value || ' seconds')::interval
from generate_series(1, 23) value;

insert into public.achievements (
  owner_id, title, description, category, achievement_date, visibility, rarity,
  status, lifecycle_status, idempotency_key, cover_key, image_provider, completed_at
) values (
  'a1000000-0000-4000-8000-000000000001',
  'Unrelated Patch', 'This must not match the collection search.', 'social',
  current_date, 'public', 'common', 'completed', 'completed', gen_random_uuid(),
  'social-common-1', 'local-pixel', now()
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table first_page on commit drop as
select * from public.get_collection_v3(
  'completed', null, 'cursor', 'newest', false, false, 21,
  null, null, null, null
);
create temporary table visible_first_page on commit drop as
select * from first_page order by created_at desc, id desc limit 20;

select is((select count(*)::integer from first_page), 21, 'collection returns a one-item lookahead cursor page');
select is((select count(*)::integer from visible_first_page), 20, 'the initial collection render is capped at twenty Patches');
select is((select count(*)::integer from first_page where title = 'Unrelated Patch'), 0, 'server-side search scopes every page');

create temporary table second_page on commit drop as
select * from public.get_collection_v3(
  'completed', null, 'cursor', 'newest', false, false, 21,
  (select created_at from visible_first_page order by created_at asc, id asc limit 1),
  (select id from visible_first_page order by created_at asc, id asc limit 1),
  null, null
);

select is((select count(*)::integer from second_page), 3, 'the next keyset page returns the remaining search results');
select ok(not exists (
  select 1 from visible_first_page first_item
  join second_page second_item on second_item.id = first_item.id
), 'collection cursor pages do not duplicate Patches');

reset role;
select * from finish();
rollback;
