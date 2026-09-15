# 30. Optionally publish one explicitly selected approved sample

Status: ready-for-human
Implementation: not started
Depends on: [29](29-operator-first-preview.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S7, S9, and the relevant [contracts](../contracts.md). Existing repository pointers: operator-first-test.md; verified Facebook contract; setup CLI. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Execute only after explicit operator authorization naming selected artifact and destination Page; this ticket's existence is not that authorization. Confirm current hash, rights, independent review, credentials and preview/live selection.
2. Invoke publish-one for that Page/artifact/hash and request ID. Submit no other queued post, persist exact remote identifiers and read back the result. An upload response alone cannot pass.
3. If outcome is uncertain, reconcile the same attempt or hold it; do not start a second post. Keep public URL/time and sanitized receipt, and explain actual visibility to the operator.
4. Leave continuous activation disabled. Deleting the test post or enabling recurring publication is a separate operator action, not automatic cleanup.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A30.

Suggested focused tests: Operator-authorized external verification only.

Record passed/failed/unknown per tested format. One Reel does not prove text/photo delivery. Do not mark full live verification or activate daily posting from a single-format smoke.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: pending
- Changed files: pending
- Tests and actual results: pending
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: pending

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.
