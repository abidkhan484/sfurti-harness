# 21. Enforce publication authorization and uncertain-outcome recovery

Status: ready-for-agent
Implementation: not started
Depends on: [19](19-facebook-text-photo.md), [20](20-facebook-reels.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S7, and the relevant [contracts](../contracts.md). Existing repository pointers: src/planning.ts; src/service.ts; src/app.ts; src/notifications.ts; src/adapters/telegram.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Centralize a mutation gate for preview/live mode, selected publish-one authorization and continuous activation. Enforce at dispatch and adapter boundaries, including cancellation, service-cycle and Telegram commands.
2. Implement reconcile/cancel from verified Meta contracts and durable journal. Known remote IDs use authoritative read-back; absent status requires proof across relevant attempts. Unknown outcomes block duplicate submit/cancel claims.
3. Bind one-shot authorization to Page/artifact/version/hash/request ID and operation; one selection cannot drain other posts. Continuous activation is distinct and invalidates on Page/critical config changes.
4. Preserve permission expiry/integrity checks at intended publication time and remote-confirmed schedules on replan. Deactivation stops new writes, retains remote history and allows explicitly scoped reconciliation.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A10, A18, A22, A23.

Suggested focused tests: test/pi-publication-gate.test.ts.

Test every entry point in preview, lost response with no remote ID, stale permission, cancellation unknown, selected artifact amid other queued posts and repeated selected authorization.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: partial fixture implementation. Graph submit/photo/Reel and known Page-post cancellation now require a Page-bound authorization before secret resolution or mocked HTTP; preview still rejects mutations. Planning holds incomplete/absent reconciliation as unknown instead of retrying it, and one-shot authorization is Page/request/artifact-version/hash/post/operation bound.
- Changed files: src/app.ts; src/planning.ts; src/service.ts; src/adapters/facebook.ts; test/pi-publication-gate.test.ts; test/pi-facebook-text-photo.test.ts; test/pi-facebook-reels.test.ts
- Tests and actual results: `node --test --test-reporter spec test/pi-publication-gate.test.ts test/pi-posting-windows.test.ts test/pi-backup.test.ts` passed (3/3); `npm run typecheck` passed. Full suite still needs a stable rerun after the shared changes.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: real Graph contracts/capability, Page authority, permission expiry at real intended time, and any real read-back/cancellation remain unverified; no external action occurred.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.
