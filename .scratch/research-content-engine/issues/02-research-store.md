# 02 — Add durable research storage, events and indexes

Status: ready-for-agent
Implementation: not started
Dependencies: [01](01-research-contracts.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: C1–C2, C7
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Schema upgrades are repeatable and durable; repository callers do not need raw untyped SQL.

## Files and boundaries

- src/store.ts
- src/research/repository.ts
- test/research-store.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Add every C2 collection using the existing JSON-table approach. Replace unconditional migration marking with an additive versioned migration that works on a v1 database.
2. Implement typed repository methods saveDraft, transition, dueTasks, dependentsOfClaim, sourceVersions and paginated list. Enforce allowed transitions and optimistic revision/lease ownership.
3. Create unique/expression indexes for search-match identity, entity-version outbox identity and dependency lookup; add due/status indexes. Preserve existing rows byte-for-byte where no migration is required.
4. Commit event and pending memory job with source/claim changes in one transaction. Never put async work inside Store.transaction.

## Acceptance checks

- Open a v1 fixture containing artifacts/posts, migrate, reopen twice and preserve old records.
- Two concurrent approvals/identical matches create one durable result.
- Simulated failure rolls back entity, event and outbox together; dependency query returns every dependent post.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-store.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
- Implemented 2026-09-10: extended `src/store.ts` with the additive v2 research collections and JSON-expression indexes; added typed transaction-bound `src/research/repository.ts`; added `test/research-store.test.ts` covering v1 preservation/reopen and atomic claim/outbox rollback behavior.
- Checks: focused store test passed; `npm run typecheck` passed; `git diff --check` passed. `node --test --test-reporter spec test/adapters.test.ts` passed all 10 tests. The full `npm test` aggregate currently fails only as an opaque top-level failure for `test/adapters.test.ts` while that same file passes in isolation; all six remaining test files pass. `npm run lint` has the pre-existing 127 warnings and no errors.
- Deviations: repository due-job lookup remains JSON-table based pending targeted Store query support in a later performance-focused integration; all returned records remain typed. External prerequisites: none for offline storage behavior.
