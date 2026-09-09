# 03 — Add explicit research, content and integration configuration

Status: ready-for-agent
Implementation: not started
Dependencies: [01](01-research-contracts.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S2, C9
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Both legacy and evidence modes have deterministic defaults and documented validation errors.

## Files and boundaries

- src/config.ts
- config/harness.example.json
- .env.example
- test/research-config.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Add research.enabled, productionMode legacy/evidence, research limits/cadences, memory config, content totalPostsPerDay/mix, TTS/render paths and optional browser settings using S2 defaults.
2. Preserve old config behavior when keys are absent. Evidence-mode example is explicit; loading or validating it must not enable live publishing.
3. Validate weights sum to 1, window/count bounds, HTTP bases and local asset paths, all cadence limits and supported enums. Store secret environment references rather than embedding credentials.
4. Ensure public config, daily snapshots and status redact tokens/session locations and provider credentials. Keep original age range and custom schedule behavior.

## Acceptance checks

- Old config produces identical legacy defaults.
- Invalid weight total, negative limits and duplicate integration implementations fail clearly.
- Public snapshot contains no provided secret values; example validates with credentials absent as configured-but-not-ready.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-config.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
