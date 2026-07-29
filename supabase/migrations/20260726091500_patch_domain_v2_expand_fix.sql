-- Follow-up to the additive domain migration. Keep it separate so deployed
-- migration history remains immutable.

create or replace function public.create_patch_v2(
  p_title text,
  p_description text,
  p_category public.achievement_category,
  p_rarity public.achievement_rarity,
  p_visibility public.achievement_visibility,
  p_lifecycle_status public.patch_lifecycle_status,
  p_event_date date,
  p_target_date date,
  p_operation_id uuid
)
returns table (
  achievement_id uuid,
  job_id uuid,
  lifecycle_status public.patch_lifecycle_status,
  generation_status public.achievement_status,
  was_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_achievement public.achievements%rowtype;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 80 then
    raise exception 'title must contain 2 to 80 characters' using errcode = 'check_violation';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 2 and 600 then
    raise exception 'description must contain 2 to 600 characters' using errcode = 'check_violation';
  end if;
  if p_event_date is null or p_event_date > current_date then
    raise exception 'event date cannot be in the future' using errcode = 'check_violation';
  end if;
  if p_lifecycle_status = 'locked' and p_target_date is not null and p_target_date < p_event_date then
    raise exception 'target date cannot precede the Patch date' using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
  );
  select * into v_achievement
  from public.achievements
  where owner_id = v_user_id and idempotency_key = p_operation_id;
  if found then
    select j.id into v_job_id from public.achievement_generation_jobs j
    where j.achievement_id = v_achievement.id order by j.created_at desc limit 1;
    return query select v_achievement.id, v_job_id, v_achievement.lifecycle_status, v_achievement.status, true;
    return;
  end if;

  insert into public.achievements (
    owner_id, title, description, category, achievement_date, target_date,
    visibility, rarity, lifecycle_status, source_kind, status, idempotency_key
  ) values (
    v_user_id, trim(p_title), trim(p_description), p_category, p_event_date,
    case when p_lifecycle_status = 'locked' then p_target_date else null end,
    p_visibility, p_rarity, p_lifecycle_status, 'user',
    (case when p_lifecycle_status = 'completed' then 'processing' else 'draft' end)::public.achievement_status,
    p_operation_id
  ) returning * into v_achievement;

  insert into public.achievement_events (
    achievement_id, owner_id, operation_id, kind, event_date, title, note
  ) values (
    v_achievement.id, v_user_id, p_operation_id, 'created', p_event_date,
    v_achievement.title, v_achievement.description
  );

  v_job_id := private.create_generation_job_if_needed(v_achievement);
  select * into v_achievement from public.achievements where id = v_achievement.id;
  return query select v_achievement.id, v_job_id, v_achievement.lifecycle_status, v_achievement.status, false;
end;
$$;

grant select, update on public.achievement_generation_jobs to service_role;
