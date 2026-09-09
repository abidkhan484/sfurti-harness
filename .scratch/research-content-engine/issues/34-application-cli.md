# 34 — Expose research, memory and feedback commands through the harness

Status: ready-for-agent
Implementation: not started
Dependencies: [05](05-query-planning.md), [11](11-source-registry-triage.md), [12](12-topic-priority.md), [14](14-evidence-review.md), [17](17-evidence-retrieval.md), [18](18-content-briefs.md), [27](27-production-coordination.md), [30](30-audience-feedback.md), [31](31-refresh-withdrawal.md), [32](32-legacy-content-audit.md), [33](33-critical-exceptions.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: C6
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

An operator can run and inspect the complete workflow without editing database rows.

## Files and boundaries

- src/app.ts
- src/cli.ts
- test/research-application.test.ts
- docs/usage.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Wire every C6 application command to its implemented module; validate required arguments and bound list pagination.
2. Add CLI subcommands with matching help and structured outputs. Keep commandId/requestId idempotency behavior and source/member data redaction.
3. Implement memory-search and research-export for inspection; output directories are explicit and generated exports contain permitted data only.
4. Expose safe research-status counters/backlog/freshness/critical cases without dumping credentials or entire private source records.
5. List/show/status commands perform no provider calls or mutation.

## Acceptance checks

- Each documented command dispatches correctly through createHarness.execute.
- Malformed IDs/missing fields fail before provider calls.
- Same commandId returns same result; changed payload under same ID fails.
- List pagination and status redact protected fields.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-application.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
