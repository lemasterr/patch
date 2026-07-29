# Architecture

## Boundaries

The mobile client is an untrusted public client. It may read and invoke only
the APIs granted to `authenticated`; it never receives service credentials.
Protected mutations are implemented as RLS-checked RPCs or authenticated Edge
Functions. Queue workers use service authorization and are not mobile APIs.

## Data flow

```text
Mobile UI → React Query / typed query keys → Supabase RLS or authenticated RPC
Create / retry → Edge Function → idempotent Postgres job → protected worker
Notification event → delivery queue → Expo ticket → receipt reconciliation
```

Every RLS-sensitive query key includes the viewing account. Account changes
clear React Query state, notification state, queued operations, completed queue
results, drafts, and the allow-listed persisted cache before another account's
state is exposed.

Runtime feature flags are fetched after each authenticated transition and are
cached only under that account's local key. The control layer records its
non-sensitive flag version and source (remote, cache, stale cache, or default)
for diagnostics. It can pause creation, Discover, social surfaces, travel, or
push registration, but it never grants access or replaces server authorization.

## Offline model

The SQLite queue stores an account ID, operation ID, idempotency key, state,
attempt count, next retry time, and a two-minute lease. It retries transient
errors with bounded exponential backoff, returns expired leases to the queue,
and surfaces terminal work in Settings for retry or removal. A completed queued
Patch retains only its result ID for up to seven days so the app can open its
reveal screen.

Creation drafts use account-scoped SQLite key-value storage. Discover is the
only persisted query-cache root; profiles, Collections, friends, and
notification bodies are not persisted in that cache.

## Backend workers

- `process-achievement-jobs` claims generation jobs and records terminal state.
- `process-push-deliveries` reclaims expired delivery leases, sends bounded
  batches, and disables invalid Expo devices.
- `process-push-receipts` reconciles receipts and also disables invalid devices.

The delivery claim rechecks the current push preference and runtime push flag.
An already queued delivery that is no longer eligible becomes terminal rather
than being sent or retried indefinitely.

Hosted schedules must call these worker endpoints with service authorization.
The `get_background_job_health_v1` RPC is service-only and exposes queue counts,
stale leases, and terminal failures without user content. Alert thresholds and
response ownership are release configuration, not client configuration.

## Security model

RLS is enabled for public data. Tables that must not be directly mutated by the
client have their grants revoked; their server-owned fields are changed only by
reviewed RPCs, triggers, or Edge Functions. Database tests exercise direct-write
denials, account isolation, lifecycle visibility, travel validation, reports,
deletion retention, and worker queue leases.
