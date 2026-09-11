# 04 — Add search and topic-validation roles with review isolation

Status: ready-for-agent
Implementation: not started
Dependencies: [01](01-research-contracts.md), [03](03-research-configuration.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S4, C4
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Independent role contracts run against fake providers and existing generation/review tests still pass.

## Files and boundaries

- src/adapters/llm.ts
- src/adapters/index.ts
- src/research/agents.ts
- test/research-agents.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Extend TaskModelRouter assignments with search and topic-validation while preserving generation/review.
2. Implement C4 agent wrappers with versioned instruction templates and explicit bounded inputs. Keep mission instructions separate from untrusted source payloads.
3. Record task/provider/model/policy metadata. Evidence reviewer receives cited source material but no validator conversation; content reviewer receives finished artifact evidence but no generator session history.
4. Validate reviewer isolation by distinct session IDs or a documented fresh-request adapter capability; reject unknown/shared identity. Same model across different isolated roles is allowed.
5. Keep provider/model fixed on quota resumption; reuse existing deferral behavior instead of auto-switching models.

## Acceptance checks

- Each operation routes to the configured role.
- Same model/different sessions passes isolation; same session or unverifiable isolation fails.
- Injected source instructions cannot add a publishing action to structured output; schema rejects it.
- Quota deferral preserves task model and editorial counters.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-agents.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
- Implemented 2026-09-10: added `search` and `topic-validation` task routes, fresh-request isolation metadata, and bounded data-only C4 wrappers in `src/research/agents.ts`; updated the Codex role-purpose contract and added deterministic role/isolation/injection/quota tests in `test/research-agents.test.ts`.
- Checks: focused agent test passed; `npm run typecheck` passed; changed-file lint passed with repository baseline warnings only; `git diff --check` passed. No live provider was invoked.
- Deviations: provider JSON schema remains permissive only at transport level for compatibility; strict root-field allowlists and operation parsers remain the authoritative rejection gate. External prerequisites: configured role models and credentials are required only for live execution.
