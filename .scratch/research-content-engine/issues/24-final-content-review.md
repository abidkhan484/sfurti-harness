# 24 — Review finished artifacts against approved evidence

Status: ready-for-agent
Implementation: not started
Dependencies: [04](04-agent-role-routing.md), [17](17-evidence-retrieval.md), [19](19-bangla-content-generation.md), [23](23-independent-media-inspection.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S4, S7, C3–C4
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Only actual independently reviewed artifact versions can become approved in evidence mode.

## Files and boundaries

- src/content/review.ts
- src/production.ts
- src/adapters/index.ts
- test/content-review.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Extend review input/schema for claim checks, uncovered assertions, actual media evidence, identity and severity while keeping legacy review compatibility.
2. Review caption, hook, overlays, narration and activities for scientific support, Bangla fidelity, mission and age suitability.
3. Programmatic checks override a model pass when dependencies/media/identity are invalid. Bind approval to exact artifact hash/version/policy.
4. Use one initial version plus two corrections; exhaustion -> deferred/rejected without human escalation unless independently critical.
5. Keep final review separated from evidence review: evidence may pass while generated wording fails.

## Acceptance checks

- Approved packet plus exaggerated hook fails final review.
- Same reviewer/generator session fails; isolated same-model sessions are allowed.
- Third failed version terminates without fourth generation or routine human task.
- Caption-only modification invalidates old approval.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/content-review.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
