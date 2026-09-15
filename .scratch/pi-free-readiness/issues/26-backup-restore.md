# 26. Back up and verify the Pi library without losing lineage

Status: ready-for-agent
Implementation: not started
Depends on: [06](06-bounded-storage.md), [07](07-folder-intake.md), [21](21-publication-authorization-reconciliation.md), [23](23-readiness-receipts.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S8, and the relevant [contracts](../contracts.md). Existing repository pointers: src/maintenance.ts; src/store.ts backup; src/app.ts storage; docs/setup.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Extend backup manifest to all required source/media/evidence/qualification/review/journal/setup records and tool/non-secret config versions. Use consistent SQLite backup and checksum each retained referenced file.
2. Exclude secrets and private Codex session/auth contents; document reauthentication after restore. Budget backup peak disk and reject destinations inside managed source/output trees or insufficient space.
3. Implement restore verification into a new isolated destination without overwriting current runtime. Verify schema/row counts/hashes/references and report missing lineage; restored remote state must reconcile before any new submission.
4. Document same-card backup limitations and copying to an existing separate device. Provide preview-only retention accounting; no auto-deletion of originals/approved media.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A28.

Suggested focused tests: test/pi-backup.test.ts.

Round-trip a populated synthetic library with permission/review/remote records, detect changed/missing files, reject unsafe destination, and prove original DB and private secrets are untouched.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed local backup/restore verification. Backup makes a consistent SQLite copy, inventories checksummed managed media plus referenced source/artifact/qualification/review/receipt evidence outside media, excludes configuration/auth data, and records durable lineage row counts. Restore copies only into a new isolated destination and validates the database checksum/schema, row counts, and each retained file before reporting reconciliation required.
- Changed files: src/maintenance.ts; src/app.ts; test/pi-backup.test.ts
- Tests and actual results: `node --test test/pi-backup.test.ts` passed (1/1); `npm run typecheck` passed; `git diff --check` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: fixture verification cannot establish the target device's free space or separate-device durability. Restore deliberately does not overwrite a runtime or rehydrate private auth/secrets; the operator must reauthenticate and reconcile remote state before any submission.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-15: Completed local fixture coverage including external retained review/receipt evidence. No original/approved media, credential, or runtime database was overwritten or deleted.
