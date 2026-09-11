# 30 — Collect available Page feedback and turn it into new questions

Status: ready-for-agent
Implementation: not started
Dependencies: [11](11-source-registry-triage.md), [12](12-topic-priority.md), [28](28-facebook-text-photo.md), [29](29-facebook-video-reconciliation.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S8, C2, C5
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Published content generates an auditable feedback-to-research loop using real available endpoints.

## Files and boundaries

- src/adapters/facebook/feedback.ts
- src/research/feedback.ts
- test/research-feedback.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement available own-Page comments/metrics collection with configured permissions and cursors; capability-check fields against pinned API version.
2. Schedule 24h/72h/7d observations and preserve observation timestamp. Unsupported metrics are null with reason, not zero.
3. Redact identifiers before persistence/AI classification; classify questions/misunderstandings/activity reports and link to original post/topic.
4. Deduplicate platform item IDs and create triage items for substantive new questions; prevent automated content and repeated polling from inflating recurrence.
5. Do not auto-reply or interpret engagement/activity reports as causal evidence.

## Acceptance checks

- Repeated cursor yields one question and one topic link.
- Missing insights permission leaves metrics unknown but available comments continue.
- A positive parent report remains observation, never evidence claim.
- New misunderstanding feeds next query plan.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-feedback.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
