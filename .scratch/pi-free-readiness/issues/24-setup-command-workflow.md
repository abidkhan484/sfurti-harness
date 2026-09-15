# 24. Expose safe setup probes and first-sample commands

Status: ready-for-agent
Implementation: not started
Depends on: [07](07-folder-intake.md), [09](09-source-qualification.md), [15](15-review-production-wiring.md), [17](17-telegram-polling.md), [21](21-publication-authorization-reconciliation.md), [23](23-readiness-receipts.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S9, and the relevant [contracts](../contracts.md). Existing repository pointers: src/cli.ts; src/app.ts; src/coordinator.ts request; contracts.md Proposed CLI commands. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement every proposed setup command in contracts.md via command --json with validated payloads, help output and bounded results. Wire explicit Codex/search/Page probes and selected Telegram send to typed receipts.
2. setup-sample validates only its production dependencies, imports no unrelated submissions, selects one qualified interval set and creates one custom unscheduled video. It queues notifications locally and never calls Facebook.
3. Make same request ID resumable across quota/native deferral; setup-sample-status returns exact stage/reason/artifact paths. Reject changed payload under same ID. Sample/benchmark jobs never satisfy recurring daily quotas.
4. Expose selected publish-one and activation separately with confirmLive/Page/hash checks; setup-attest cannot activate. Provide machine-readable nonzero failure/partial status semantics while keeping existing CLI commands compatible.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A17, A18, A23, A27.

Suggested focused tests: test/pi-setup-cli.test.ts.

Test all payload validation, sample while doctor false, retry, wrong source/request ID, selected delivery and zero implicit external writes. Contract names must match operator-first-test.md.

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
