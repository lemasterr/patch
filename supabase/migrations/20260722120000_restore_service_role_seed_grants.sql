-- The local seed script uses Supabase's service role through the Admin API.
-- RLS does not apply to that role, but explicit table privileges still do.
grant usage on schema public to service_role;

grant select, insert, update on table public.profiles to service_role;
grant select, insert, update on table public.user_settings to service_role;
grant select, insert, update on table public.achievements to service_role;
