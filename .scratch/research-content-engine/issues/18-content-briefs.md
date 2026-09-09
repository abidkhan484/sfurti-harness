# 18 — Generate multiple distinct briefs from each approved synthesis

Status: ready-for-agent
Implementation: not started
Dependencies: [12](12-topic-priority.md), [17](17-evidence-retrieval.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S3, S7, C2–C4
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Ready briefs are reusable production inputs with explicit claims and format.

## Files and boundaries

- src/content/briefs.ts
- test/content-briefs.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement research-briefs using approved packet, previous brief fingerprints and desired format mix; default maximum three briefs/topic/revision.
2. Require distinct angle/takeaway and traceable claim IDs; do not fill a numerical target by paraphrasing one hook.
3. Record practical action basis guidance/evidence/suggestion and age suitability. No product efficacy or invented family transformation claims.
4. Persist brief and dependencies transactionally; mark ready only if all claims still pass policy at commit.

## Acceptance checks

- One synthesis produces an explainer, Q&A and activity angle without new unsupported claims.
- Duplicate angle fingerprint is rejected; topic with one useful angle may emit one brief.
- Withdrawal during generation prevents ready status.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/content-briefs.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
