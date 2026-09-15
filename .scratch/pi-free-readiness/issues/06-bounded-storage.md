# 06. Implement streaming integrity and peak-space admission

Status: ready-for-agent
Implementation: not started
Depends on: [01](01-pi-profile-contracts.md), [02](02-secret-and-tool-boundaries.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S4–S5, S8, and the relevant [contracts](../contracts.md). Existing repository pointers: src/domain.ts; src/production.ts; src/app.ts; src/maintenance.ts; src/coordinator.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Replace whole-file-buffer hashing with bounded chunk/stream hashing while preserving hash semantics and all call-site permission checks. Use the least disruptive sync/async API consistent with current callers; test multiple chunks and mutation during read.
2. Add shared admission accounting for free disk, managed ceiling, active reservations and estimated peak copies/render/ASR bytes. Defaults: leave 8 GiB free and 32 GiB managed ceiling; count inbox/library duplication and reserved work.
3. Reserve before copying/downloading/rendering and reconcile reservation after completion, failure or fenced lease expiry. A rejected operation must not leave an approved record. Report budget/coverage shortfalls without changing daily/reserve targets.
4. Add incremental inventory and storage reporting for source/output/evidence/models/auth-session metadata/logs without secret contents. Cleanup is limited to expired owned scratch without active references; preserve originals and lineage.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A09, A10, A26.

Suggested focused tests: test/pi-storage.test.ts.

Two concurrent admissions cannot overcommit. Hash a multi-chunk file, reject mid-read changes, handle ENOSPC and crash cleanup, and verify referenced files are never removed.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed local primitives. Replaced whole-file reads with 64 KiB streamed hashing plus post-read mutation detection, and added durable peak-space reservation accounting.
- Changed files: src/domain.ts; src/deployment/storage.ts; test/pi-storage.test.ts
- Tests and actual results: `node --test test/pi-storage.test.ts` passed (1/1); `npm run typecheck` passed; `npm run lint` passed with 117 pre-existing warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed.
- Remaining blockers/limitations: concrete intake/render callers reserve/release storage in tickets 07 and 11–13; no cleanup deletes originals or lineage.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only completion; no source file was deleted or external storage action performed.
