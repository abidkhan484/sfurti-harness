# 13 — Create balanced syntheses with one conflict reconciliation pass

Status: ready-for-agent
Implementation: not started
Dependencies: [07](07-scholarly-search.md), [11](11-source-registry-triage.md), [12](12-topic-priority.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S5, C2, C4, C7
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

A synthesis contains auditable candidate claims and full search/contradiction history, not approval.

## Files and boundaries

- src/research/synthesis.ts
- test/research-synthesis.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Gather relevant findings and search coverage for a topic; perform follow-up/contrary searches within existing budgets. Record excluded sources and reasons.
2. Extract design, population, measurement, causal limitations, reported effects/uncertainty and funding when available. Missing data stays null.
3. Create candidate claims with evidence/interpretation/hypothesis/business_opinion types and justified certainty. Mark underlying repeated-study overlap.
4. If findings conflict, permit exactly one persisted reconciliation operation. Correct only demonstrated wording/context errors; qualify or defer genuine unresolved disagreement.
5. Prevent retries or automatic revision bumps from resetting the reconciliation budget; a new evidence hash can start a new documented revision.

## Acceptance checks

- An association does not produce causal wording.
- Translation-error conflict resolves with recorded original/corrected excerpt; genuine disagreement survives as qualified/deferred.
- Two reviews of one cohort do not count as independent replication.
- A restart after the reconciliation pass cannot run a second pass.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-synthesis.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
