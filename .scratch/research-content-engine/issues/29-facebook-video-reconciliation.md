# 29 — Implement Reel upload, processing and remote reconciliation

Status: ready-for-agent
Implementation: not started
Dependencies: [22](22-original-video-composition.md), [28](28-facebook-text-photo.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S7–S8, C5
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

All three requested content formats have concrete publish/reconcile paths.

## Files and boundaries

- src/adapters/facebook/reels.ts
- src/adapters/facebook/page.ts
- src/planning.ts
- test/facebook-reels.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Verify and pin current Reels API upload/start/finish/status behavior and implement real MP4 upload, bounded processing polling and publication.
2. Persist remote upload/post IDs as soon as obtained; resume upload/processing state rather than recreating a Reel after restart.
3. Support reconciliation/cancellation outcomes including unknown and unsupported; future scheduling capability is explicit per format.
4. Where the platform provides no idempotency lookup, retain uncertain state and operator-visible evidence instead of claiming exactly-once delivery.
5. Preserve existing CSV projection and local/scheduled/published state distinctions.

## Acceptance checks

- Upload accepted then processing then published uses one remote creation.
- Restart during processing resumes status lookup.
- Unknown cancellation remains unresolved; failed encoding never reports published.
- Local due-time dispatch respects existing min spacing and evidence gate.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/facebook-reels.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
