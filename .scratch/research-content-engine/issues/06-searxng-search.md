# 06 — Implement general web search through SearXNG

Status: ready-for-agent
Implementation: not started
Dependencies: [01](01-research-contracts.md), [03](03-research-configuration.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: C5, C10
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

A real HTTP adapter exists with offline transport tests and a documented live check command.

## Files and boundaries

- src/adapters/search/searxng.ts
- test/search-searxng.test.ts
- docs/integrations/research-providers.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement Search.search using configured operator-controlled base URL /search with encoded q, language, format=json and pagination.
2. Map results to the C5 hit shape; snippets remain discovery metadata and are never marked full-text evidence. Clamp output to requested limit.
3. Inject HTTP transport; handle malformed JSON, JSON-disabled 403, 429 Retry-After, timeouts and partial engine failures with classified results.
4. Record tested SearXNG version/settings in provider documentation. Do not silently fall back to a random public instance or scrape search-result HTML.

## Acceptance checks

- Fixture JSON maps Unicode query/results and next cursor correctly.
- 403 produces actionable JSON-format configuration failure; 429 defers without losing cursor.
- HTML response, excess hits and provider failure do not produce invented successful empty searches.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/search-searxng.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
- Implemented 2026-09-10: added injected-transport SearXNG JSON search in `src/adapters/search/searxng.ts`, deterministic fixtures in `test/search-searxng.test.ts`, and the verified API mapping/check procedure in `docs/integrations/research-providers.md`.
- Checks: focused SearXNG test and `npm run typecheck` passed; lint had no errors and only the existing warning baseline; `git diff --check` passed. No live request was made.
- Deviations: none. External prerequisite: an operator-controlled SearXNG instance with JSON output enabled and its version/settings recorded before activation.
