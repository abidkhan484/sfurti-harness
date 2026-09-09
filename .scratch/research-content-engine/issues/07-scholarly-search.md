# 07 — Implement Europe PMC scholarly search and source identity mapping

Status: ready-for-agent
Implementation: not started
Dependencies: [01](01-research-contracts.md), [03](03-research-configuration.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S5, C5, C10
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Scholarly results enter the same discovery pipeline while retaining scholarly identifiers.

## Files and boundaries

- src/adapters/search/europe-pmc.ts
- test/search-europe-pmc.test.ts
- docs/integrations/research-providers.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement encoded /search query with format=json, bounded pageSize and cursorMark against configured Europe PMC base URL.
2. Preserve DOI, publication/provider identifiers, available dates, author metadata and open-access/full-text link indicators. Do not mark an abstract as a full paper.
3. Map returned full-text links to ordinary fetch work; retain links to original publisher for appraisal and updated guidance.
4. Record API mapping and sample redacted response fixture; normalize source identity across web and scholarly results.

## Acceptance checks

- First and subsequent cursors return unique results and stop when exhausted.
- Abstract-only, no-DOI and open-access entries preserve distinct access states.
- A duplicate DOI from web search links provenance without becoming an independent study.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/search-europe-pmc.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
