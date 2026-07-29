-- RLS evaluates helper functions as the querying role, so the narrowly scoped
-- boolean predicate must be executable by authenticated users.  Its SECURITY
-- DEFINER body exposes no rows or identifiers.
grant execute on function private.users_are_blocked(uuid, uuid) to authenticated;
