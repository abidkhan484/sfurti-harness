# 14 — Independently validate and approve claim versions

Status: ready-for-agent
Implementation: not started
Dependencies: [04](04-agent-role-routing.md), [13](13-evidence-synthesis.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S4–S5, C3–C4
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Only supported, independently reviewed claim versions become eligible for later content generation.

## Files and boundaries

- src/research/claim-review.ts
- src/research/claim-policy.ts
- test/evidence-review.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Build a source-grounded evidence-review packet from immutable excerpts, context and metadata, separate from validator history.
2. Require per-finding source checks, scope/uncertainty preservation, allowed Bangla wording and prohibited overstatements. Apply S5 claim-type rules.
3. App checks source integrity/locators, reviewer identity and policy before recording approved/qualified status; derive expiry from configured certainty/conflict policy.
4. An LLM approval cannot override retracted sources, missing support or hypothesis restrictions. Persist review/event/memory outbox atomically.
5. Medium failures defer/revise without human escalation; critical results go to the later correction/alert interface.

## Acceptance checks

- Invented citation, source retraction and missing locator override AI approve.
- Expert opinion cannot become evidence by relabeling; explicit Sfurti opinion remains labeled.
- Approved claim gets immutable revision and validity; changed wording requires new review.
- Evidence reviewer shares producer session -> rejected.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/evidence-review.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
