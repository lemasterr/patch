-- Removes only the temporary demo identities and their cascading demo data.
-- The email predicate prevents this from ever targeting a non-demo account.

begin;

delete from auth.users
where id in (
  '11111111-1111-4111-8111-111111111001',
  '11111111-1111-4111-8111-111111111002',
  '11111111-1111-4111-8111-111111111003'
)
and email in ('maya@patch.demo', 'jonas@patch.demo', 'ines@patch.demo');

commit;
