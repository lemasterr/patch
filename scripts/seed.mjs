import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret)
  throw new Error("Supabase environment variables are required.");

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoUsers = [
  {
    email: "maya@patch.demo",
    username: "maya_roams",
    displayName: "Maya Chen",
    avatarKey: "summit",
  },
  {
    email: "jonas@patch.demo",
    username: "jonas_makes",
    displayName: "Jonas Reed",
    avatarKey: "camp",
  },
  {
    email: "ines@patch.demo",
    username: "ines_noted",
    displayName: "Inés Silva",
    avatarKey: "stargaze",
  },
];

const achievements = [
  [
    "11111111-1111-4111-8111-111111111101",
    0,
    "Took my first solo trip",
    "Missed one train, caught the next, and learned that I actually like eating dinner alone.",
    "travel",
    "rare",
    "2026-04-18",
    ["solo", "first-time"],
  ],
  [
    "11111111-1111-4111-8111-111111111102",
    1,
    "Cooked the impossible family recipe",
    "Three phone calls, one smoky kitchen, and somehow it tasted exactly like Sunday at home.",
    "creativity",
    "rare",
    "2026-05-09",
    ["cooking", "family"],
  ],
  [
    "11111111-1111-4111-8111-111111111103",
    2,
    "Spoke to a room of 200 people",
    "My hands shook for the first minute. By the last minute I did not want to leave the stage.",
    "work",
    "rare",
    "2026-03-22",
    ["public-speaking"],
  ],
  [
    "11111111-1111-4111-8111-111111111104",
    0,
    "Helped a stranger change a tire",
    "Neither of us was completely sure what we were doing, which made the high five at the end better.",
    "social",
    "common",
    "2026-06-02",
    ["kindness", "roadside"],
  ],
  [
    "11111111-1111-4111-8111-111111111105",
    1,
    "Finished a whole book in one rainy day",
    "Tea count: five. Pages: 438. Reasons to go outside: none.",
    "learning",
    "common",
    "2026-02-14",
    ["books", "rain"],
  ],
  [
    "11111111-1111-4111-8111-111111111106",
    2,
    "Got lost and found the way back",
    "The blue trail became no trail. A church tower and a very judgmental goat got me home.",
    "adventure",
    "rare",
    "2026-06-19",
    ["lost", "hiking"],
  ],
  [
    "11111111-1111-4111-8111-111111111107",
    0,
    "Woke up before dawn for the sunrise",
    "At 4:40 I hated every decision. At 5:12 the whole sky turned orange.",
    "health",
    "common",
    "2026-05-28",
    ["sunrise", "early"],
  ],
  [
    "11111111-1111-4111-8111-111111111108",
    1,
    "Fixed the sink without calling anyone",
    "There were four leftover screws. The sink works. I am choosing to call this a win.",
    "everyday",
    "common",
    "2026-01-30",
    ["repair", "somehow"],
  ],
  [
    "11111111-1111-4111-8111-111111111109",
    2,
    "Tried pottery and made a glorious blob",
    "It holds exactly three olives and an unreasonable amount of pride.",
    "funny",
    "common",
    "2026-04-03",
    ["pottery", "blob"],
  ],
  [
    "11111111-1111-4111-8111-111111111110",
    0,
    "Ran the hill I used to walk",
    "No stopwatch. No crowd. Just the top of the hill and the quiet realization that I had changed.",
    "personal",
    "legendary",
    "2026-06-30",
    ["running", "personal-goal"],
  ],
];

const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listError) throw listError;
const usersByEmail = new Map(listed.users.map((user) => [user.email, user]));
const userIds = [];

for (const user of demoUsers) {
  let authUser = usersByEmail.get(user.email);
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: "PatchDemo123!",
      email_confirm: true,
    });
    if (error) throw error;
    authUser = data.user;
  }
  userIds.push(authUser.id);

  const { error: profileError } = await admin.from("profiles").upsert({
    id: authUser.id,
    username: user.username,
    display_name: user.displayName,
    avatar_key: user.avatarKey,
    bio: "Collecting the detours as carefully as the destinations.",
    is_discoverable: true,
  });
  if (profileError) throw profileError;
  const { error: settingsError } = await admin
    .from("user_settings")
    .upsert(
      { user_id: authUser.id, theme: "system" },
      { onConflict: "user_id" },
    );
  if (settingsError) throw settingsError;
}

for (const [
  id,
  ownerIndex,
  title,
  description,
  category,
  rarity,
  date,
  tags,
] of achievements) {
  const ownerId = userIds[ownerIndex];
  const variant =
    Math.abs(
      [...title].reduce(
        (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
        2166136261,
      ),
    ) % 4;
  const { error } = await admin.from("achievements").upsert({
    id,
    owner_id: ownerId,
    title,
    description,
    category,
    rarity,
    achievement_date: date,
    visibility: "public",
    tags,
    status: "completed",
    idempotency_key: id.replace(
      "11111111-1111-4111-8111",
      "22222222-2222-4222-8222",
    ),
    cover_key: `${category}-${rarity}-${variant}`,
    image_provider: "local-pixel",
    completed_at: `${date}T12:00:00.000Z`,
  });
  if (error) throw error;
}

process.stdout.write(
  `Seeded ${demoUsers.length} demo travelers and ${achievements.length} achievements.\n`,
);
