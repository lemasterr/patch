-- Runtime flags are deterministic per account, so a percentage rollout does
-- not flicker between launches or pages of the same feed.
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]{3,80}$'),
  enabled boolean not null default false,
  rollout_percentage smallint not null default 0
    check (rollout_percentage between 0 and 100),
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, enabled, rollout_percentage)
values
  ('discover_recommendation_rounds', true, 100),
  ('collection_cursor_pagination', true, 100),
  ('content_moderation_pipeline', false, 0)
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from public, anon, authenticated;

create or replace function public.get_runtime_feature_flags_v1()
returns table (key text, enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    flag.key,
    flag.enabled
      and (
        (pg_catalog.hashtextextended(auth.uid()::text || ':' || flag.key, 0)
          & 2147483647) % 100
      ) < flag.rollout_percentage as enabled
  from public.feature_flags flag
  where auth.uid() is not null;
$$;

-- Product analytics contains an allow-listed event name, operation ID and
-- opaque subject ID only. Patch titles, descriptions, bios and query text are
-- intentionally never accepted by this API.
create table public.product_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_name text not null check (event_name in (
    'create_started', 'create_completed', 'reveal', 'share', 'reaction',
    'friend_request', 'retention'
  )),
  subject_id uuid,
  source text not null default 'mobile' check (source in (
    'mobile', 'discover', 'profile', 'notification', 'universal_link'
  )),
  operation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create index product_analytics_events_user_created_idx
  on public.product_analytics_events (user_id, created_at desc);

alter table public.product_analytics_events enable row level security;
create policy "product_analytics_read_own"
on public.product_analytics_events for select to authenticated
using (user_id = auth.uid());
revoke all on public.product_analytics_events from public, anon, authenticated;
grant select on public.product_analytics_events to authenticated;

create or replace function public.record_product_analytics_event_v1(
  p_event_name text,
  p_subject_id uuid default null,
  p_source text default 'mobile',
  p_operation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_event_name not in (
    'create_started', 'create_completed', 'reveal', 'share', 'reaction',
    'friend_request', 'retention'
  ) or p_source not in ('mobile', 'discover', 'profile', 'notification', 'universal_link')
    or p_operation_id is null then
    raise exception 'invalid analytics event' using errcode = '22023';
  end if;

  insert into public.product_analytics_events (
    user_id, event_name, subject_id, source, operation_id
  ) values (
    auth.uid(), p_event_name, p_subject_id, p_source, p_operation_id
  ) on conflict (user_id, operation_id) do nothing;
end;
$$;

-- The workers can expose these counts to an external monitor without granting
-- direct queue-table access. A scheduled monitor can alert on stale leases or
-- terminal failures; it never receives user content.
create or replace function public.get_background_job_health_v1()
returns table (
  queue text,
  queued_count bigint,
  running_count bigint,
  stale_lease_count bigint,
  failed_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    'generation'::text,
    count(*) filter (where job.status = 'queued'),
    count(*) filter (where job.status = 'running'),
    count(*) filter (where job.status = 'running' and job.lease_expires_at <= now()),
    count(*) filter (where job.status = 'failed')
  from public.achievement_generation_jobs job
  union all
  select
    'push'::text,
    count(*) filter (where delivery.status = 'queued'),
    count(*) filter (where delivery.status = 'running'),
    count(*) filter (where delivery.status = 'running' and delivery.lease_expires_at <= now()),
    count(*) filter (where delivery.status = 'failed')
  from public.push_deliveries delivery;
end;
$$;

revoke all on function public.get_runtime_feature_flags_v1(),
  public.record_product_analytics_event_v1(text, uuid, text, uuid),
  public.get_background_job_health_v1()
from public, anon;
grant execute on function public.get_runtime_feature_flags_v1(),
  public.record_product_analytics_event_v1(text, uuid, text, uuid)
to authenticated;
grant execute on function public.get_background_job_health_v1() to service_role;
