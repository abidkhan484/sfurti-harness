# 29. Run the first real preview and Pi capacity benchmark

Status: ready-for-human
Implementation: not started
Depends on: [28](28-pi-packaging-runbook.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S9, and the relevant [contracts](../contracts.md). Existing repository pointers: operator-first-test.md; docs/setup-pi.md (created by 28). These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Operator supplies 64-bit OS/environment facts, available power/cooling, private Codex login, Page/token configuration and Telegram private identity. An implementing agent can perform local setup after authorized; only human login/permission decisions need the operator.
2. Use one permitted original-Bangla source and accurate manifest/evidence. Run probes, intake, qualification and one setup-sample with preview enforced. Open the actual clip and listen; record context, Bangla readability and audio findings.
3. Explicitly send only that preview to Telegram, verify receipt, attest approved sample and run doctor. Missing/failed criteria remain false; do not waive them or post to Facebook to fix local readiness.
4. Supply three distinct eligible sources for the daily benchmark, keep target 3/1/1, and record whether a complete package finishes within 24 h plus storage/reserve estimate. Conditional dubbing remains unavailable until separately auditioned.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A29.

Suggested focused tests: On-device/operator verification only.

Save sanitized receipt/report paths and measured result. Successful local sample is distinct from day-volume pass, full reserve and public publication. No paid service or hardware purchase is required by this ticket.

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
