# 05 — Generate bounded multilingual discovery and counter-evidence queries

Status: ready-for-agent
Implementation: not started
Dependencies: [02](02-research-store.md), [04](04-agent-role-routing.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S3, C4, C8
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

A persisted plan can be resumed and executed by connectors without another planning call.

## Files and boundaries

- src/research/query-planning.ts
- test/research-query-planning.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement research-plan from five buckets, queued questions, feedback and prior query history; no seed sites are required.
2. Apply 40/30/20/10 purpose budgeting, neutral/counter-evidence requirements and query limits from C8. Support any configured query language and preserve source-language-independent intake.
3. Normalize query text for duplication while preserving language/provider identity; persist SearchRun before executing searches.
4. Record why each query was chosen; do not generate only harm-confirming screen queries. Use deterministic fallback bucket prompts if no audience questions exist.

## Acceptance checks

- Empty registry produces a bounded plan without Facebook URLs.
- BN/EN queries and counter-evidence queries appear in a fixture plan; another configured language is accepted.
- Repeated plan identity does not duplicate work; a 2-query budget keeps exploration and counter-evidence.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-query-planning.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
- Implemented 2026-09-10: added deterministic persisted planning and resume execution in `src/research/query-planning.ts`, plus four fixture tests in `test/research-query-planning.test.ts`. It covers empty-registry five-bucket fallback, configured languages, neutral/counter-evidence minimums, C8 allocation/borrowing, language/provider-aware deduplication, stable IDs, and no replanning during execution.
- Checks: focused test, `npm run typecheck`, lint with no errors, Prettier for changed files, and `git diff --check` passed.
- Deviations: the C4 rationale is represented by a local planning-query type because persisted C2 `SearchQuery` deliberately omits it; the planner keeps it before mapping to the durable record. External prerequisites: none.
