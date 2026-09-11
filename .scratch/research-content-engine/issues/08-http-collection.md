# 08 — Implement bounded HTTP collection and URL access checks

Status: ready-for-agent
Implementation: not started
Dependencies: [02](02-research-store.md), [03](03-research-configuration.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S6, C5, C8
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Fetched bytes and outcomes are bounded, attributable and restart-safe.

## Files and boundaries

- src/adapters/collection/http.ts
- src/research/url-policy.ts
- test/research-fetch.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement public HTTP fetch with conditional ETag/Last-Modified, redirect limit, MIME/size/time caps and per-host pacing. Persist fetch outcome/checkpoint.
2. Reject localhost/private/link-local/metadata IP destinations for discovered URLs, including DNS resolution and redirects; configured internal service URLs use separate trusted adapters.
3. Apply collection policy and robots handling with an explicit recorded reason. Authentication walls and blocked fetches stay unavailable; do not use snippets as substituted documents.
4. Compute hash while streaming within the cap; write allowed snapshots via temporary file and atomic rename. Protect against arbitrary fetched filename paths.

## Acceptance checks

- 304 updates lastCheckedAt only for the same known version; a changed body creates a new hash.
- Oversized chunked body, redirect to private IP and unsupported MIME fail before ingestion.
- 429 preserves nextRunAt; one host failure does not block another host.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-fetch.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
- Implemented 2026-09-10: added public URL/SSRF policy, bounded streaming HTTP collection with conditional checkpoints and atomic hash snapshots, and fixture tests in `src/research/url-policy.ts`, `src/adapters/collection/http.ts`, and `test/research-fetch.test.ts`.
- Checks: focused fetch test, `npm run typecheck`, lint with no errors, and `git diff --check` passed. No network call was made.
- Deviations: durable checkpoint persistence is intentionally deferred to the later shared command/service integration ticket; collector returns typed checkpoint data without performing async work inside a store transaction. External prerequisites: none for offline behavior.
