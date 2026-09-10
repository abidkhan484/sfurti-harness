# 01 — Define research records and runtime schemas

Status: ready-for-agent
Implementation: not started
Dependencies: None
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: C1–C4
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

New contracts compile and parser tests pass without database/network changes.

## Files and boundaries

- src/research/contracts.ts
- src/research/schemas.ts
- test/research-contracts.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement every C2 record as a named TypeScript interface and literal union. Share envelopes/locators/reviewer identity rather than duplicate them. Use explicit nullable unknown fields.
2. Implement parsers for persisted records and C4 agent outputs; validate positive revisions, ISO dates, hash syntax, bounded arrays, enum values and valid offsets. Keep filesystem integrity checks outside pure parsers.
3. Reject invented approval status from extraction/generation output: agent draft schemas cannot set app-owned IDs, audit fields or approved status.
4. Export schemas and type guards usable by TaskModelRouter; include field-specific errors without printing complete source text.

## Acceptance checks

- Round-trip one valid fixture for each record and each agent operation.
- Reject missing provenance, end<start, out-of-range certainty, unknown status and oversized output.
- A generator returning status approved is rejected; null effect size remains null.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-contracts.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
- Implemented 2026-09-10: added `src/research/contracts.ts`, `src/research/schemas.ts`, and `test/research-contracts.test.ts`. The contracts define the C2 ledger records and draft agent boundaries; parsers enforce envelope, UTC date, revision, locator, enum, array-bound, and app-owned approval/audit invariants without echoing source content.
- Checks: `node --test --test-reporter spec test/research-contracts.test.ts` passed (3 assertions); `npm run typecheck` passed; `npm run lint` completed with the existing 127 warnings and no errors; `git diff --check` passed.
- Deviations: none. External prerequisites: none for offline contract validation.
