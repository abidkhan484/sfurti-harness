# 15 — Package a pinned Cognee service and typed HTTP adapter

Status: ready-for-agent
Implementation: complete for offline versioned HTTP mapping; release-specific pin pending operator verification
Dependencies: [01](01-research-contracts.md), [03](03-research-configuration.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S6, C5, C10
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Real Cognee requests can be made through one adapter; local setup is reproducible and separately live-tested.

## Files and boundaries

- src/adapters/memory/cognee.ts
- deploy/research/compose.yaml
- test/cognee-adapter.test.ts
- docs/integrations/research-providers.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Select and pin a released Cognee version after checking official API docs; record image/package version and API request/response fixtures. Use service HTTP adapter, preserving future replaceability.
2. Map C5 upsert/status/search/remove/health to that release's supported operations. Implement asynchronous processing status instead of assuming ingestion response means indexing complete.
3. Create separate dataset mappings for audience/evidence/approved-claims/editorial-history. Disable automatic session-to-evidence promotion or route it outside approved datasets.
4. Supply local service deployment with persistent volumes and secret environment references; no exposed unauthenticated network default. Report provider/embedding configuration required.
5. Add version/capability compatibility errors rather than accepting arbitrary unstructured completion text as a provenance hit.

## Acceptance checks

- Transport fixtures cover indexing pending/ready/failed and incompatible version.
- Memory search without entity IDs is rejected/excluded.
- Dataset routing and credentials redaction hold across all operations.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/cognee-adapter.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
- Implemented 2026-09-10. Changed `src/adapters/memory/cognee.ts`,
  `test/cognee-service.test.ts`, and `docs/integrations/research-providers.md`.
  The adapter supplies a typed, bounded `Memory` boundary; routes only the four
  approved datasets; requires entity-version/content-hash/schema provenance;
  excludes unresolvable search hits; preserves pending/ready/failed job status;
  and fails closed on health version/capability incompatibility. Its token is
  never included in adapter errors.
- Checks: `node --test test/cognee-service.test.ts` passed (all fixture cases);
  focused ESLint, subsequent `npm run typecheck`, and `git diff --check`
  passed.
- Deviation/external prerequisite: no immutable Cognee HTTP release, API schema,
  auth-header convention, or image digest was verified offline. Per the setup
  runbook, no floating `main` image or invented provider fields were pinned.
  The current implementation requires a reviewed `CogneeProtocol` constructed
  from an operator-provided tag, commit/digest, capability health response, and
  redacted upsert/status/search/remove fixtures. Replacing the synthetic
  fixture mapping with that release-specific protocol remains required for
  locally tested or live-ready status.
