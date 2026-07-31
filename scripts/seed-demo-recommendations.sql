-- Temporary hosted-demo data for the Discover recommendation screen.
--
-- These exact UUIDs are owned by the companion cleanup script. Do not reuse
-- them for product data. The demo accounts are not intended for sign-in.

begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111001',
    'authenticated',
    'authenticated',
    'maya@patch.demo',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"demo":true}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111002',
    'authenticated',
    'authenticated',
    'jonas@patch.demo',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"demo":true}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111003',
    'authenticated',
    'authenticated',
    'ines@patch.demo',
    null,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"demo":true}'::jsonb,
    now(),
    now()
  )
on conflict do nothing;

insert into public.profiles (
  id,
  username,
  display_name,
  avatar_key,
  bio,
  is_discoverable,
  onboarding_completed
)
values
  (
    '11111111-1111-4111-8111-111111111001',
    'maya_roams',
    'Maya Chen',
    'summit',
    'Collecting the detours as carefully as the destinations.',
    true,
    true
  ),
  (
    '11111111-1111-4111-8111-111111111002',
    'jonas_makes',
    'Jonas Reed',
    'camp',
    'Small experiments, generous meals, and useful mistakes.',
    true,
    true
  ),
  (
    '11111111-1111-4111-8111-111111111003',
    'ines_noted',
    'Inés Silva',
    'stargaze',
    'Saving the moments that made ordinary days glow.',
    true,
    true
  )
on conflict (id) do nothing;

insert into public.user_settings (user_id, theme)
values
  ('11111111-1111-4111-8111-111111111001', 'system'),
  ('11111111-1111-4111-8111-111111111002', 'system'),
  ('11111111-1111-4111-8111-111111111003', 'system')
on conflict (user_id) do nothing;

insert into public.achievements (
  id,
  owner_id,
  title,
  description,
  category,
  achievement_date,
  visibility,
  rarity,
  tags,
  status,
  idempotency_key,
  cover_key,
  image_provider,
  completed_at,
  lifecycle_status,
  source_kind,
  created_at
)
values
  (
    '11111111-1111-4111-8111-111111111101',
    '11111111-1111-4111-8111-111111111001',
    'Took my first solo trip',
    'Missed one train, caught the next, and learned that I actually like eating dinner alone.',
    'travel',
    date '2026-04-18',
    'public',
    'rare',
    array['solo', 'first-time'],
    'completed',
    '22222222-2222-4222-8222-222222222101',
    'demo-travel-rare-1',
    'demo-seed',
    timestamptz '2026-04-18 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-04-18 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    '11111111-1111-4111-8111-111111111002',
    'Cooked the impossible family recipe',
    'Three phone calls, one smoky kitchen, and somehow it tasted exactly like Sunday at home.',
    'creativity',
    date '2026-05-09',
    'public',
    'rare',
    array['cooking', 'family'],
    'completed',
    '22222222-2222-4222-8222-222222222102',
    'demo-creativity-rare-1',
    'demo-seed',
    timestamptz '2026-05-09 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-05-09 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111103',
    '11111111-1111-4111-8111-111111111003',
    'Spoke to a room of 200 people',
    'My hands shook for the first minute. By the last minute I did not want to leave the stage.',
    'work',
    date '2026-03-22',
    'public',
    'rare',
    array['public-speaking'],
    'completed',
    '22222222-2222-4222-8222-222222222103',
    'demo-work-rare-1',
    'demo-seed',
    timestamptz '2026-03-22 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-03-22 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111104',
    '11111111-1111-4111-8111-111111111001',
    'Helped a stranger change a tire',
    'Neither of us was completely sure what we were doing, which made the high five at the end better.',
    'social',
    date '2026-06-02',
    'public',
    'common',
    array['kindness', 'roadside'],
    'completed',
    '22222222-2222-4222-8222-222222222104',
    'demo-social-common-1',
    'demo-seed',
    timestamptz '2026-06-02 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-06-02 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111105',
    '11111111-1111-4111-8111-111111111002',
    'Finished a whole book in one rainy day',
    'Tea count: five. Pages: 438. Reasons to go outside: none.',
    'learning',
    date '2026-02-14',
    'public',
    'common',
    array['books', 'rain'],
    'completed',
    '22222222-2222-4222-8222-222222222105',
    'demo-learning-common-1',
    'demo-seed',
    timestamptz '2026-02-14 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-02-14 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111106',
    '11111111-1111-4111-8111-111111111003',
    'Got lost and found the way back',
    'The blue trail became no trail. A church tower and a very judgmental goat got me home.',
    'adventure',
    date '2026-06-19',
    'public',
    'rare',
    array['lost', 'hiking'],
    'completed',
    '22222222-2222-4222-8222-222222222106',
    'demo-adventure-rare-1',
    'demo-seed',
    timestamptz '2026-06-19 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-06-19 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111107',
    '11111111-1111-4111-8111-111111111001',
    'Woke up before dawn for the sunrise',
    'At 4:40 I hated every decision. At 5:12 the whole sky turned orange.',
    'health',
    date '2026-05-28',
    'public',
    'common',
    array['sunrise', 'early'],
    'completed',
    '22222222-2222-4222-8222-222222222107',
    'demo-health-common-1',
    'demo-seed',
    timestamptz '2026-05-28 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-05-28 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111108',
    '11111111-1111-4111-8111-111111111002',
    'Fixed the sink without calling anyone',
    'There were four leftover screws. The sink works. I am choosing to call this a win.',
    'everyday',
    date '2026-01-30',
    'public',
    'common',
    array['repair', 'somehow'],
    'completed',
    '22222222-2222-4222-8222-222222222108',
    'demo-everyday-common-1',
    'demo-seed',
    timestamptz '2026-01-30 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-01-30 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111109',
    '11111111-1111-4111-8111-111111111003',
    'Tried pottery and made a glorious blob',
    'It holds exactly three olives and an unreasonable amount of pride.',
    'funny',
    date '2026-04-03',
    'public',
    'common',
    array['pottery', 'blob'],
    'completed',
    '22222222-2222-4222-8222-222222222109',
    'demo-funny-common-1',
    'demo-seed',
    timestamptz '2026-04-03 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-04-03 12:00:00+00'
  ),
  (
    '11111111-1111-4111-8111-111111111110',
    '11111111-1111-4111-8111-111111111001',
    'Ran the hill I used to walk',
    'No stopwatch. No crowd. Just the top of the hill and the quiet realization that I had changed.',
    'personal',
    date '2026-06-30',
    'public',
    'legendary',
    array['running', 'personal-goal'],
    'completed',
    '22222222-2222-4222-8222-222222222110',
    'demo-personal-legendary-1',
    'demo-seed',
    timestamptz '2026-06-30 12:00:00+00',
    'completed',
    'user',
    timestamptz '2026-06-30 12:00:00+00'
  )
on conflict (id) do nothing;

commit;
