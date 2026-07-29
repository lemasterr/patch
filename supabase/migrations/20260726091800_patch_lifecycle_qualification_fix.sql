-- Output-column names are PL/pgSQL variables; qualify the job column.
create or replace function public.set_patch_lifecycle(
  p_patch_id uuid,
  p_status public.patch_lifecycle_status,
  p_event_date date,
  p_note text,
  p_operation_id uuid,
  p_confirm_generation_revert boolean default false
)
returns table (
  achievement_id uuid,
  job_id uuid,
  lifecycle_status public.patch_lifecycle_status,
  generation_status public.achievement_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patch public.achievements%rowtype;
  v_job_id uuid;
  v_kind public.achievement_event_kind;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_operation_id is null then
    raise exception 'an operation id is required' using errcode = '22023';
  end if;
  if p_event_date is null or p_event_date > current_date then
    raise exception 'event date cannot be in the future' using errcode = 'check_violation';
  end if;

  select * into v_patch from private.assert_patch_owner(p_patch_id);
  if exists (
    select 1 from public.achievement_events e
    where e.owner_id = v_patch.owner_id and e.operation_id = p_operation_id
  ) then
    select j.id into v_job_id from public.achievement_generation_jobs j
    where j.achievement_id = v_patch.id order by j.created_at desc limit 1;
    return query select v_patch.id, v_job_id, v_patch.lifecycle_status, v_patch.status;
    return;
  end if;
  if v_patch.lifecycle_status = p_status then
    return query select v_patch.id, null::uuid, v_patch.lifecycle_status, v_patch.status;
    return;
  end if;

  if v_patch.lifecycle_status = 'completed' and p_status <> 'completed' then
    if not p_confirm_generation_revert then
      raise exception 'confirm reverting a completed Patch before changing its lifecycle' using errcode = 'check_violation';
    end if;
    if v_patch.cover_key is not null or v_patch.cover_url is not null then
      raise exception 'a generated Patch cannot return to a goal' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.achievement_generation_jobs j
      where j.achievement_id = v_patch.id and j.status = 'running'
    ) then
      raise exception 'generation is already running; try again when it settles' using errcode = 'P0001';
    end if;
    update public.achievement_generation_jobs j
    set status = 'failed', finished_at = now(), error_message = 'Lifecycle changed before generation completed.'
    where j.achievement_id = v_patch.id and j.status = 'queued';
    update public.achievements a
    set status = 'failed', failure_reason = 'Generation cancelled because the Patch returned to a goal.'
    where a.id = v_patch.id and a.status in ('processing', 'draft');
  end if;

  update public.achievements a
  set lifecycle_status = p_status,
      target_date = case when p_status = 'locked' then p_event_date else a.target_date end
  where a.id = v_patch.id
  returning * into v_patch;

  v_kind := case
    when p_status = 'completed' then 'completed'::public.achievement_event_kind
    when p_status = 'in_progress' then 'progress'::public.achievement_event_kind
    else 'note'::public.achievement_event_kind
  end;
  insert into public.achievement_events (
    achievement_id, owner_id, operation_id, kind, event_date, note
  ) values (
    v_patch.id, v_patch.owner_id, p_operation_id, v_kind, p_event_date,
    nullif(trim(coalesce(p_note, '')), '')
  );

  v_job_id := private.create_generation_job_if_needed(v_patch);
  select * into v_patch from public.achievements a where a.id = v_patch.id;
  return query select v_patch.id, v_job_id, v_patch.lifecycle_status, v_patch.status;
end;
$$;
