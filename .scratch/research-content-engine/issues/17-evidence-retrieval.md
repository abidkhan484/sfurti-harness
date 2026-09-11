# 17 — Resolve memory hits into current verified evidence packets

Status: ready-for-agent
Implementation: not started
Dependencies: [14](14-evidence-review.md), [16](16-memory-outbox.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S6, C3, C5
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Every generated evidence packet is inspectable and publication-compatible despite stale memory.

## Files and boundaries

- src/research/retrieval.ts
- test/evidence-retrieval.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Query Cognee using topic/question plus explicit dataset restrictions, then hydrate entity IDs through research repository.
2. Verify claim current status, scope, expiry, source hashes and locators; include original excerpts/translations and limitations within token budget.
3. Exclude stale/unresolvable hits and generated memory summaries without provenance. Retrieve contrary evidence alongside supportive evidence.
4. When Cognee is unavailable allow exact topic/claim-ID lookup from ledger with retrievalMode ledger_exact; do not silently substitute broad model knowledge.
5. Persist packet IDs/hash and excluded-hit reasons so generation/review are reproducible.

## Acceptance checks

- Cognee returns withdrawn claim with high score -> excluded.
- Audience and generated-history hits cannot enter scientific support.
- Cross-language fixture resolves original excerpt and Bangla wording; contrary finding is retained.
- No valid hits returns insufficient_evidence, not a fabricated answer.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/evidence-retrieval.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
