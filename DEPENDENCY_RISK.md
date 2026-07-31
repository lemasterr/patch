# Dependency risk review

Last reviewed: 2026-07-31

After aligning to the Expo SDK 57 compatible patch releases, `npm audit
--omit=dev` reports 25 high and 11 moderate advisories, with no critical
advisories. The high-severity chain includes `GHSA-mh99-v99m-4gvg` in
`brace-expansion`, reachable through Jest tooling. `npm` also marks its Jest
peer graph as production-reachable even after Jest, Jest Expo, Jest types, and
Testing Library are declared as development dependencies. The affected
packages are used for tests, Metro/Expo tooling, or React Native's test preset;
Patch does not execute this graph in the shipped application.

This is an accepted, time-limited build-tooling risk rather than a release
approval. Do not run untrusted glob patterns in CI. Re-evaluate after the next
Expo SDK 57-compatible Jest/React Native patch release, and no later than
2026-09-30. CI fails on any critical runtime advisory.

No automatic `npm audit fix` is used because its proposed updates can break the
Expo SDK 57 compatibility set. The release checklist requires a new audit
review before a store submission.
