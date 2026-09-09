# 37 — Add full-loop regression and evidence-quality evaluation fixtures

Status: ready-for-agent
Implementation: not started
Dependencies: [10](10-optional-browser-collection.md), [35](35-continuous-service.md), [36](36-backup-retention.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S9, acceptance.md
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

The integrated system has reproducible evidence of behavior, limits and regressions.

## Files and boundaries

- test/research-e2e.test.ts
- test/fixtures/research/
- scripts/evaluate-research.ts
- docs/research-evaluation.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement every acceptance.md scenario using isolated temp storage, injected clocks/transports and labeled synthetic source fixtures.
2. Create a small curated evaluation corpus across languages, age groups, supportive/contrary studies, expert opinions, prompt injection and outdated claims. Label synthetic fixtures clearly so they never publish.
3. Add opt-in model evaluation reporting source/locator validity, unsupported claims, causal overstatement, contradiction retention and Bangla fidelity; separate deterministic tests from subjective review.
4. Require zero forbidden publications in deterministic adversarial tests; do not treat a small model evaluation as proof of universal accuracy.
5. Run full existing and new checks once after integration; report any failure without weakening tests or gates.

## Acceptance checks

- All A1–A14 acceptance scenarios pass.
- Evaluation output includes corpus/version, model/version, sample count and exact failures.
- No fixture adapter can be selected accidentally in live configuration.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-e2e.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
