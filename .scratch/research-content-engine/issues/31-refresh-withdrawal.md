# 31 — Refresh evidence and contain invalidated claims across content

Status: ready-for-agent
Implementation: not started
Dependencies: [16](16-memory-outbox.md), [25](25-claim-publication-gate.md), [29](29-facebook-video-reconciliation.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S5–S8, C3, C7
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Evidence changes propagate through the entire lifecycle with an inspectable correction history.

## Files and boundaries

- src/research/refresh.ts
- src/research/corrections.ts
- test/research-refresh.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Schedule S2 refresh cadences, prioritizing upcoming posts. Recheck canonical sources and available retraction/correction metadata; do not assume all corrections can be detected automatically.
2. 304/same content updates lastCheckedAt; meaningful changes create a new candidate version and invalidate affected claim approval until reviewed.
3. Within one transaction expire/withdraw claim, append event, hold dependent drafts/local posts and enqueue memory removal plus correction case.
4. For remote-scheduled posts request cancellation then reconcile; unknown remains unresolved. For published posts retain history and prepare reviewed correction draft, never silently delete.
5. Do not update freshness on outage; expired sources hold eligibility while independent work continues.

## Acceptance checks

- Changed evidence fans out to every dependent draft, local and remote post.
- One claim supporting three formats invalidates all three.
- Failed fetch cannot extend validity; stale memory cannot restore approval.
- Uncertain remote cancellation is not reported contained.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-refresh.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
