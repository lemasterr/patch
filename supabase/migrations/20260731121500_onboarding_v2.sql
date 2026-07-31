-- A profile row can exist before onboarding is complete (for example after an
-- interrupted legacy signup). Complete its missing contract atomically rather
-- than treating the row as a finished profile.
create or replace function public.complete_onboarding_v2(
  p_username text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := lower(trim(coalesce(p_username, '')));
  v_display_name text := trim(coalesce(p_display_name, ''));
  v_existing public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_username !~ '^[a-z0-9_]{3,24}$'
    or char_length(v_display_name) not between 1 and 80 then
    raise exception 'invalid onboarding fields' using errcode = 'check_violation';
  end if;

  select * into v_existing
  from public.profiles
  where id = v_user_id
  for update;

  if found and v_existing.onboarding_completed then
    insert into public.user_settings (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;
    return;
  end if;

  begin
    if found then
      update public.profiles
      set username = v_username,
          display_name = v_display_name,
          onboarding_completed = true
      where id = v_user_id;
    else
      insert into public.profiles (
        id, username, display_name, avatar_key, onboarding_completed
      ) values (
        v_user_id, v_username, v_display_name, 'trail', true
      );
    end if;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;

  insert into public.user_settings (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.complete_onboarding_v2(text, text) from public, anon;
grant execute on function public.complete_onboarding_v2(text, text) to authenticated;
