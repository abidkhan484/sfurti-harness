# 38 — Finish setup, doctor and explicit live verification runbook

Status: ready-for-agent
Implementation: not started
Dependencies: [06](06-searxng-search.md), [07](07-scholarly-search.md), [10](10-optional-browser-collection.md), [15](15-cognee-service.md), [21](21-piper-bangla-tts.md), [23](23-independent-media-inspection.md), [29](29-facebook-video-reconciliation.md), [30](30-audience-feedback.md), [33](33-critical-exceptions.md), [36](36-backup-retention.md), [37](37-end-to-end-evaluation.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S9, C10
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

All implementation checks pass and the operator has a concrete activation checklist; unavailable external setup is clearly separated from completed code.

## Files and boundaries

- src/maintenance.ts
- docs/setup.md
- docs/architecture.md
- docs/integrations.md
- docs/usage.md
- README.md
- test/research-doctor.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Extend read-only doctor with separate configured/locally_tested/live_verified status for search, extraction, optional browser, Cognee, role isolation, Piper/font/media, Page publishing and feedback.
2. Provide version-pinned setup instructions and configuration examples for every required executable/service; missing secrets become explicit setup prerequisites, not dummy success.
3. Document full command sequence: dry-run -> collect/validate -> render/review -> local plan -> explicitly requested live sample -> remote reconciliation -> feedback.
4. Require actual operator authorization for live post and preserve returned Page/remote ID, timestamps and outcome. Offline ticket completion does not set live_verified.
5. Update architecture links and legacy/evidence-mode activation/rollback instructions, source registry growth, cadence/cost controls and critical-case workflow.

## Acceptance checks

- Doctor makes zero network calls and never reports live_verified from adapter presence.
- Absent optional browser does not block baseline readiness; missing Piper blocks video readiness.
- Stale/mismatched verification attestation does not mark current configuration verified.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-doctor.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
