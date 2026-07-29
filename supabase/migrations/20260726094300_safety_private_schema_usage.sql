-- Public RPCs which invoke the block predicate run as `security invoker`;
-- authenticated callers need schema usage in addition to EXECUTE on the
-- function.  No private objects are granted directly.
grant usage on schema private to authenticated;
