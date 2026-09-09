# 32 — Import existing content into an explicit scientific-review queue

Status: ready-for-agent
Implementation: not started
Dependencies: [14](14-evidence-review.md), [24](24-final-content-review.md), [25](25-claim-publication-gate.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S7–S8, C3
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Evidence-mode activation has an explicit migration path without silently grandfathering old claims.

## Files and boundaries

- src/research/legacy-audit.ts
- test/legacy-audit.test.ts
- docs/usage.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement preview-first research-legacy-audit for existing artifacts, preserving file bytes, original approvals and remote post history.
2. Extract candidate claims from old text/captions/media and route them through normal evidence matching/review; never auto-approve because old claims flag was true.
3. Evidence-mode uses unassessed/held scientific status until successful review. Legacy mode behavior remains unchanged before evidence-mode activation.
4. Provide optional Markdown import path for operator-selected historical drafts; avoid automatic scanning or editing sibling repositories.
5. Treat already published content as audit/correction cases rather than rewriting it in place.

## Acceptance checks

- Old approved unsupported dopamine claim is held in evidence mode.
- Preview mutates nothing; apply preserves original artifact/hash and links new review.
- Already published post keeps remote ID and audit trail.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/legacy-audit.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
