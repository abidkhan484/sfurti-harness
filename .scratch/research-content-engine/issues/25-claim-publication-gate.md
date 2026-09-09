# 25 — Enforce evidence dependencies during planning and publishing

Status: ready-for-agent
Implementation: not started
Dependencies: [14](14-evidence-review.md), [24](24-final-content-review.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S8, C3, C7
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

No scheduling/publication path bypasses current evidence eligibility in evidence mode.

## Files and boundaries

- src/research/eligibility.ts
- src/planning.ts
- src/production.ts
- test/evidence-eligibility.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement reusable evaluateEvidenceEligibility(artifact,at,phase) returning allowed/reasons, then call at generation, approval, plan and immediately before submit.
2. Check exact current claim/source versions, scope, validUntil, lastCheckedAt at submission, policy, integrity and independent review.
3. Persist dependency edges to allocated posts; ledger withdrawal/expiry holds local work immediately even if Cognee still returns old data.
4. Preserve legacy media rights rules; evidence-mode old artifacts without scientific review remain unassessed/held.
5. Prevent an already allocated but newly invalid artifact from reaching Facebook adapter.

## Acceptance checks

- Withdraw after allocation -> zero submit calls.
- Future date beyond validity excluded from verified coverage.
- Changed source hash, altered caption and policy mismatch each block.
- Cognee outage cannot disable ledger gate.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/evidence-eligibility.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
