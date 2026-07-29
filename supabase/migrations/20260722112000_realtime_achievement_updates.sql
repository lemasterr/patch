-- Reveal listens for lifecycle changes and falls back to bounded polling when
-- a client is temporarily offline. Add the table exactly once to Realtime.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'achievements'
  ) then
    alter publication supabase_realtime add table public.achievements;
  end if;
end;
$$;
