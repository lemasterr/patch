# Patch

Patch is a native iOS and Android app for recording and sharing personal
milestones. The client is built with Expo SDK 57, React Native, and Expo Router;
Supabase Auth, Postgres, Realtime, and Edge Functions provide the backend.

## What is in this repository

- [`mobile/`](./mobile) — Expo client and its tests.
- [`supabase/`](./supabase) — versioned schema migrations, local configuration,
  seed data, pgTAP tests, and Edge Functions.
- [`scripts/`](./scripts) — development and repository validation helpers.
- [Architecture](./ARCHITECTURE.md), [security policy](./SECURITY.md), and the
  [release checklist](./RELEASE_CHECKLIST.md).

## Local development

Prerequisites: Node.js 20.9+, npm, Docker Desktop (or compatible runtime), and
Xcode or Android Studio for native device builds.

```bash
npm ci
npm --prefix mobile ci
npm run supabase:start
npm run seed:local
npm run mobile:ios:local
```

Use `npm run mobile:android:local` for Android, or
`npm run mobile:start:local` to run Metro without launching a simulator. The
local wrappers derive public local Supabase values without printing or writing
credentials.

For a hosted backend, copy `mobile/.env.example` to `mobile/.env` and set only:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_EAS_PROJECT_ID` once the EAS project is linked

Do not place a service-role key, SMTP credential, provider credential, signing
material, or token in a mobile environment file.

## Edge Functions

The deployed set is:

- `create-achievement`
- `retry-achievement`
- `process-achievement-jobs`
- `process-push-deliveries`
- `process-push-receipts`
- `delete-account`

User-facing functions require an authenticated user. Worker functions require
service authorization and are intended only for protected schedules or trusted
server calls. See [Architecture](./ARCHITECTURE.md) before configuring hosted
schedules.

## Validation

```bash
npm run format:check
npm run mobile:check
npm --prefix mobile test
npm --prefix mobile run doctor
npm run lint:db
npm run test:db
npm run check:types
npm run check:secrets
npm --prefix mobile run export:ios
npm --prefix mobile run export:android
```

`npm run check:edge` runs Deno format, lint, type checking, and Edge tests. CI
installs the pinned Deno runtime; install Deno 2.1.4 locally before invoking
that command. Dependency-risk review and its expiry are recorded in
[DEPENDENCY_RISK.md](./DEPENDENCY_RISK.md).

## Release status

Local schema, client, unit, database, and bundle validation are reproducible.
Hosted migrations, function deployment, scheduler configuration, signing,
physical-device push testing, legal-policy approval, and store submission are
separate controlled release actions; see [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
