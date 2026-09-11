# 19 — Generate structured Bangla copy, scripts and scenes

Status: ready-for-agent
Implementation: not started
Dependencies: [04](04-agent-role-routing.md), [18](18-content-briefs.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S7, C3–C4
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Production-ready structured content exists without performing rendering or approving itself.

## Files and boundaries

- src/content/generation.ts
- src/content/scene-schema.ts
- test/content-generation.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Generate text body/caption or structured image/video scenes from a ready brief and verified packet; preserve source qualifiers and age framing.
2. Create claimLocations for hooks, body, overlay, narration and caption; add concise source links and attribution to public caption.
3. Accept only typed scene components such as title/body/diagram/items and asset references. Reject arbitrary executable HTML/JS and remote asset URLs outside asset policy.
4. Record fingerprint, immutable version, prompt/policy/model metadata; feed reviewer corrections into subsequent versions within existing three-total-version cap.

## Acceptance checks

- Generator cannot invent an extra factual hook not in approved packet.
- Bangla output retains a conditional qualifier; citation caption is nonempty for factual content.
- Scene input containing script tags/arbitrary commands is rejected.
- Repeat request ID returns existing draft, not another billable call.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/content-generation.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
