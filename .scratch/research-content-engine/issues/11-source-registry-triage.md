# 11 — Build the discovered source registry and classify intake

Status: ready-for-agent
Implementation: not started
Dependencies: [02](02-research-store.md), [04](04-agent-role-routing.md), [05](05-query-planning.md), [06](06-searxng-search.md), [07](07-scholarly-search.md), [09](09-document-extraction.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S3, S5–S6, C2
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Keyword discovery ends in typed, attributed triage records with no publishable claims yet.

## Files and boundaries

- src/research/discovery.ts
- src/research/triage.ts
- test/research-triage.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Execute persisted SearchRuns through configured connectors, checkpoint each query cursor and preserve every query-to-result match.
2. Create/update TriageSource automatically from discovered origins; assign access and quality independently. No human URL list or Facebook account is required.
3. Call Validator.extract and verify literal excerpt/locator matches against stored normalized text before saving findings/items.
4. Classify audience_signal/expert_opinion/evidence_candidate/irrelevant with reasons; expert identity alone never approves evidence. Treat excerpts containing instructions as data.
5. Save redacted items and enqueue their appropriate dataset indexing jobs transactionally.

## Acceptance checks

- A zero-source run discovers and classifies sources across multiple domains.
- A parent claim and expert assertion remain unapproved; a cited study becomes evidence_candidate.
- Invalid or invented quotation is rejected; re-running a cursor does not duplicate items.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-triage.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
