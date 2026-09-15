# 07. Import READY-marked permission-backed video folders

Status: ready-for-agent
Implementation: not started
Depends on: [06](06-bounded-storage.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S5, and the relevant [contracts](../contracts.md). Existing repository pointers: src/production.ts register-source; src/domain.ts; src/store.ts; contracts.md Source submission. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Create src/intake/scan.ts and parsers using contracts.md. Discover only immediate valid submission directories with READY created last; bound manifest size and enforce 2 GiB/60-minute video profile caps.
2. Validate file stability, canonical containment, no symlink/path traversal/device, real video probe, permission evidence and scope/restrictions/expiry. Reuse register-source after admission; retain source/evidence and preserve the inbox originals.
3. Persist fingerprint, lease and import result. Prevent repeated permission records after retries and recover the crash gap between file retention and DB commit. Changed bytes under an existing submission ID yield conflict.
4. Manual submissions without recommendation IDs are supported. Import sets cleared permission state only, never metadata.qualified. Produce durable held reasons and queued notifications without sending implicitly.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A07, A08, A09, A10.

Suggested focused tests: test/pi-intake.test.ts.

Scan valid folder twice; simulate incomplete copy, stale READY, changed video, missing rights, nonempty restrictions, escaped path and restart mid-import. One durable source/permission identity results.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level folder intake. READY-marked immediate folders parse the submission contract, reject escaped/symlink paths and unresolved restrictions, retain source/evidence through `register-source`, preserve inbox originals, and persist idempotent import/conflict/held records without setting qualification metadata.
- Changed files: src/intake/scan.ts; src/app.ts; test/pi-intake.test.ts
- Tests and actual results: `node --test test/pi-intake.test.ts` passed (2/2); `npm run typecheck` passed; `npm run lint` passed with 117 pre-existing warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed; fixture media is not a real MP4.
- Remaining blockers/limitations: ticket 29 must validate FFprobe duration/corruption checks and Pi storage capacity using operator-owned permitted footage. No inbox original is changed or deleted.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only completion, no source permission was inferred and no notification was sent.
