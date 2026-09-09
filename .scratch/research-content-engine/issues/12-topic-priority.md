# 12 — Cluster parent questions and prioritize research topics

Status: ready-for-agent
Implementation: not started
Dependencies: [11](11-source-registry-triage.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S3, C8
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

research-topics returns a ranked, explainable queue of answerable questions.

## Files and boundaries

- src/research/topics.ts
- test/research-topics.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Create ResearchTopic from linked triage items with age/population/exposure/comparison/outcome fields and one of the five buckets.
2. Use validator judgments for similarity and bounded priority components; app computes the exact C8 sum and deterministic ordering.
3. Deduplicate syndicated observations; preserve separate topics when age/context/outcome materially differ. Store merge/link rationale.
4. Allow evidence-first topics when no parent comment exists, and feedback-derived follow-up topics with provenance.

## Acceptance checks

- Two paraphrased concerns cluster; adolescent and preschool findings are not silently combined.
- 100 copied comments do not score as 100 independent reports.
- Out-of-range AI priority components fail; ties sort reproducibly.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-topics.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
