-- The queue worker is a service-role-only component and needs direct access
-- for lease inspection and operational repair; mobile roles receive no grant.
grant select, insert, update on public.achievement_generation_jobs to service_role;
