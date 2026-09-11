# 27 — Connect validated briefs to durable daily and custom production

Status: ready-for-agent
Implementation: not started
Dependencies: [18](18-content-briefs.md), [24](24-final-content-review.md), [26](26-rolling-content-mix.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S3, S7–S8, C6–C7
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Daily and custom evidence-mode production runs through the actual shared application boundary.

## Files and boundaries

- src/coordinator.ts
- src/production.ts
- src/content/production.ts
- test/evidence-production.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement produce-from-brief and evidence-mode tick branch that selects ready briefs for needed kinds and creates artifacts through generation/render/review.
2. Persist phase checkpoints so restart after TTS/render resumes at next phase, not repeat generation. Reuse existing leases and global workload limits.
3. Handle original_text/original_image/original_explainer explicitly; legacy_clip continues its existing source-permission/segment path.
4. Keep custom requests additional and unscheduled by default. Supply topic/age/dependency IDs through coordinator without overriding them with global topic text.
5. Publish no content when upstream validation is insufficient; record shortage and continue other independent jobs.

## Acceptance checks

- Full fake-provider topic-to-artifact chain persists all dependencies.
- Restart after render does not invoke generator/TTS again.
- Custom brief produces no automatic default slot; legacy clip tests stay green.
- Research failure does not erase existing eligible reserve.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/evidence-production.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
