# Release checklist

## Before hosted deployment

- [ ] Compare local and hosted migration histories, schema, grants, RLS,
      deployed functions, Auth configuration, logs, schedules, backups, and data
      volume.
- [ ] Apply migrations to a staging branch or environment first; do not apply
      `supabase/seed.sql` to hosted data.
- [ ] Review rollback or forward-fix steps, locking risk, and backup/PITR
      recoverability.
- [ ] Configure public app URL, exact redirect allow-list, `patch://auth/callback`,
      SMTP, rate limits, CAPTCHA/password policy as required, and hosted secrets.
- [ ] Deploy and smoke-test all six Edge Functions.
- [ ] Create protected schedules for generation, push delivery, and push receipt
      workers; configure queue-health and report-backlog alerts.

## Release candidate

- [ ] Run the complete local validation set in the root README.
- [ ] Run a clean Debug and Release iOS warning audit and record accepted
      third-party warnings.
- [ ] Build iOS and Android development, preview, and signed production
      artifacts from the release commit.
- [ ] Test clean install and upgrade on supported iOS and Android devices in
      light, dark, and system themes.
- [ ] Test authentication, recovery link, creation/reveal, Collection, Discover,
      social safety actions, travel, notifications, logout/account switch, offline
      reconnect, and account deletion.
- [ ] Test foreground, background, and terminated push delivery with token
      registration, denial, rotation, and invalid-device handling.

## Legal and store review

- [ ] Obtain approved Terms of Service, Privacy Policy, Community Guidelines,
      support contact, and moderation/appeal process from the product owner or
      counsel. Add their final URLs to the app and store metadata.
- [ ] Verify App Privacy and Google Data Safety declarations against the actual
      product and backend configuration.
- [ ] Prepare store descriptions, screenshots, reviewer account/instructions,
      age/content declarations, account-deletion disclosure, and release notes.
- [ ] Obtain explicit approval before upload or store submission.

## Rollback

- [ ] Document the exact release commit, EAS artifact IDs, migration timestamps,
      deployed function versions, and schedule configuration.
- [ ] Prefer a forward database fix; do not roll back a migration against
      production data without a reviewed data-recovery plan.
- [ ] Disable a harmful feature through hosted controls or schedules while a
      forward fix is prepared.
