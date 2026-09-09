# 16 — Synchronize versioned knowledge into Cognee durably

Status: ready-for-agent
Implementation: not started
Dependencies: [02](02-research-store.md), [14](14-evidence-review.md), [15](15-cognee-service.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S6, C7
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Memory is a rebuildable, eventually synchronized index with visible backlog and failures.

## Files and boundaries

- src/research/memory-sync.ts
- test/memory-sync.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Drain pending MemoryJobs using leases, stable entity-version IDs and bounded attempts. Construct indexed text with type, provenance and scope metadata.
2. Poll asynchronous indexing across service cycles; mark ready only after positive status. Keep authoritative evidence available when Cognee fails.
3. On changed/withdrawn versions enqueue removals and new version upserts; record tombstones and retain audit history.
4. Recover timeout-after-success by stable IDs/status queries so repeated tasks do not create uncontrolled duplicate graph documents.

## Acceptance checks

- Crash between remote success and local commit converges to one logical indexed version.
- Cognee outage leaves claim ledger intact and job deferred.
- Withdrawn version stays blocked while remove is pending; reindex preserves original source identity.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/memory-sync.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
