# 01. Define the Pi profile and durable contracts

Status: ready-for-agent
Implementation: not started
Depends on: none

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S2–S4, and the relevant [contracts](../contracts.md). Existing repository pointers: src/config.ts; src/types.ts; src/store.ts; src/adapters/index.ts; test/research-config.test.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Add opt-in deployment.profile=pi-free, preview mode, chatgpt-only billing, budgets and typed native-adapter discriminants from contracts.md. Preserve executable-wrapper and non-Pi configurations.
2. Add runtime parsers for submissions, recommendation/qualification, setup receipts and operation journals. Reject unknown enum values, negative budgets, invalid ISO dates and contradictory modes. Configuration carries secret file references only.
3. Add additive SQLite collections/indexes for the new durable records with repeatable migration. Reuse existing tasks/source/permission truth. Name all fields and discriminants in contracts.md as implemented.
4. Keep daily 3/1/1, reserve 90, legacy production and disabled research/memory. Record the Pi deployment decision in a new ADR during implementation, referencing existing ADRs without rewriting them.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A01, A02.

Suggested focused tests: test/pi-config.test.ts; test/pi-contracts.test.ts; test/pi-store.test.ts.

Round-trip each record; reject invalid config and retain populated legacy DB rows across two opens. No adapters or network calls are implemented in this ticket.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed locally. Added an opt-in `pi-free` profile with preview, ChatGPT-only billing, 3/1/1 and 90-day invariants; durable Pi record parsers; and additive SQLite collections/indexes.
- Changed files: src/config.ts; src/deployment/contracts.ts; src/store.ts; docs/adr/0006-pi-free-preview-profile.md; test/pi-config.test.ts; test/pi-contracts.test.ts; test/pi-store.test.ts
- Tests and actual results: `node --test test/pi-config.test.ts test/pi-contracts.test.ts test/pi-store.test.ts` passed (3/3); `npm run typecheck` passed; `npm run lint` passed with 117 pre-existing warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed; this ticket has no native or account operation.
- Remaining blockers/limitations: profile defaults and fixture validation are not evidence of installed ARM64 tools, Codex authentication, external accounts, capacity, or live readiness.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Completed fixture-testable ticket 01 only. Legacy configuration remains opt-in-compatible and Pi settings reject API-key-shaped integration configuration. No network, credential, adapter, publication, notification, commit, or deletion action was performed.
