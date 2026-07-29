# Security policy

## Reporting a vulnerability

Do not include credentials or personal data in a public issue. Use a private
GitHub security advisory for this repository, or contact the project maintainer
through the private channel listed in the release configuration. Include a
minimal reproduction, affected version or commit, impact, and suggested
mitigation where possible.

## Supported version

Security fixes are applied to the current `main` release line. Hosted releases
must be built from a reviewed commit with current migrations and generated
database types.

## Secret handling

- Mobile builds use only public Supabase URL and publishable-key values.
- Service-role, SMTP, image-provider, signing, APNs, FCM, and EAS credentials
  remain in approved secret storage and are never committed.
- Edge Functions read secrets from their runtime environment.
- `npm run check:secrets` scans repository source for common committed-secret
  patterns; it complements, but does not replace, secret management controls.

## Operational assumptions

- RLS and function grants are part of the security boundary; do not grant direct
  table writes to browser roles as a shortcut.
- Worker endpoints are service-only and must not be exposed through mobile code.
- Run the database test suite after every schema or authorization change.
- Incident response starts by containing the affected credential or endpoint,
  preserving relevant audit evidence, applying a forward fix, and notifying
  affected users when required by law or contract.
