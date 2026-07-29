drop function if exists public.set_country_visit(
  text,
  text,
  public.country_visit_status,
  smallint,
  smallint,
  text
);

create or replace function public.set_country_visit(
  p_country_code text,
  p_country_name text,
  p_status public.country_visit_status,
  p_visit_month integer default null,
  p_visit_year integer default null,
  p_note text default null
)
returns table (country_achievement_id uuid, aggregate_achievement_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code text := upper(trim(p_country_code));
  v_name text := trim(p_country_name);
  v_country_achievement_id uuid;
  v_aggregate_achievement_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid country code' using errcode = 'check_violation';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'invalid country name' using errcode = 'check_violation';
  end if;
  if (p_visit_month is null) <> (p_visit_year is null) then
    raise exception 'month and year must be provided together' using errcode = 'check_violation';
  end if;

  insert into public.visited_countries (
    user_id, country_code, country_name, status, visited_at,
    visit_month, visit_year, note
  ) values (
    v_user_id, v_code, v_name, p_status, current_date,
    p_visit_month, p_visit_year, nullif(trim(coalesce(p_note, '')), '')
  )
  on conflict (user_id, country_code) do update
    set country_name = excluded.country_name,
        status = excluded.status,
        visit_month = excluded.visit_month,
        visit_year = excluded.visit_year,
        note = excluded.note;

  if p_status in ('visited', 'lived') then
    select a.id into v_country_achievement_id
    from public.achievements a
    where a.owner_id = v_user_id
      and a.idempotency_key = md5(v_user_id::text || ':country:' || v_code)::uuid;
  end if;
  select a.id into v_aggregate_achievement_id
  from public.achievements a
  where a.owner_id = v_user_id
    and a.idempotency_key = md5(v_user_id::text || ':country-count')::uuid;

  return query select v_country_achievement_id, v_aggregate_achievement_id;
end;
$$;

revoke all on function public.set_country_visit(text, text, public.country_visit_status, integer, integer, text) from public, anon;
grant execute on function public.set_country_visit(text, text, public.country_visit_status, integer, integer, text) to authenticated;
