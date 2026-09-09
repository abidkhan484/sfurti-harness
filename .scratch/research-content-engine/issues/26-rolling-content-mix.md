# 26 — Replace evidence-mode fixed daily quotas with rolling mix allocation

Status: ready-for-agent
Implementation: not started
Dependencies: [03](03-research-configuration.md), [25](25-claim-publication-gate.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S2, C9
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Allocator honors the requested long-run ratio with auditable deviations and preserved legacy behavior.

## Files and boundaries

- src/content/mix.ts
- src/planning.ts
- test/content-mix.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement the exact C9 deficit algorithm as a pure function with tie order video,image,text and last-19 virtual history.
2. Integrate under planner lease with totalPostsPerDay, immutable daily snapshot and persisted reservations; future planning includes earlier reserved kinds.
3. Exclude custom-origin work from default counts. Record substitutions/shortages instead of generating unsafe content to satisfy weights.
4. Use topic IDs for evidence-mode relevance and maximum two briefs/topic/day; retain source diversity for legacy clips only.
5. Report mix deviation, verified/provisional coverage and evidence-expiry shortfall separately.

## Acceptance checks

- Empty continuously eligible history produces 2 text/5 image/13 video over 20 allocations.
- Restart midway yields the same remaining choices.
- Video shortage, cancelled reservation, custom post and already published history behave as C9 specifies.
- 90-day plan cannot count expired claims as verified stock.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/content-mix.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
