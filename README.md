# Patch Native

Patch is a native iOS and Android social archive for personal achievements.
The product client lives in [`mobile/`](./mobile) and is built with Expo SDK 57,
React Native, and Expo Router. The backend is Supabase, with Row Level Security
and database functions as the source of truth.

This workspace contains only the native product and its Supabase backend. The
app has no WebView or browser-client runtime dependency.

## Repository layout

- [`mobile/`](./mobile) — the iOS and Android client.
- [`supabase/`](./supabase) — migrations, local configuration, seed data, and
  pgTAP database tests, including the native achievement-generation Edge
  Functions.
- [`scripts/`](./scripts) — safe helpers for launching native Metro with local
  Supabase public values and for repeatable development seeding.
- [`PATCH_TERRA_EXECUTION_PLAN.md`](./PATCH_TERRA_EXECUTION_PLAN.md) — the
  implementation contract and release checklist.

## Local development

Prerequisites: Node.js 20.9+, npm, Docker Desktop (or compatible runtime), and
Xcode or Android Studio for device builds.

```bash
npm ci
npm --prefix mobile ci
npm run supabase:start
npm run seed:local
npm run mobile:ios:local
```

Use `npm run mobile:android:local` for Android. `mobile:start:local` starts
Metro without launching a simulator. The wrapper derives local Supabase values
from the CLI without printing them or writing them to a file.

For a hosted project, copy [`mobile/.env.example`](./mobile/.env.example) to
`mobile/.env` and set only the two public `EXPO_PUBLIC_SUPABASE_*` values.

## Achievement generation

The native creation form calls the authenticated `create-achievement` Edge
Function. It writes an idempotent `processing` achievement and one durable
Postgres job. `process-achievement-jobs` claims jobs with row locks, completes
them idempotently, retries transient failures with backoff, and records a
final failure plus one notification when its attempt limit is reached.

For local function work, run the database first, then use:

```bash
npx supabase functions serve
```

The `mobile:*:local` commands also serve the local Edge Functions, so creating a
Patch works without starting a second development process.

Before a hosted release, deploy `create-achievement`,
`process-achievement-jobs`, and `retry-achievement`, and configure the
platform scheduler to invoke `process-achievement-jobs` with the service-role
credential at least once per minute. This recovery trigger is what processes
jobs if the immediate background invocation ends while the app is closed.

## Validation

```bash
npm run mobile:check
npx --prefix mobile expo-doctor
npm run test:db
npm run lint:db
```

Before releasing, run the physical-device accessibility, performance, offline,
and notification checklist in [TODO.md](./TODO.md), then build through the EAS
profiles in [`mobile/eas.json`](./mobile/eas.json).
