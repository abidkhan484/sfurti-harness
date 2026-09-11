# 28 — Implement real Facebook Page text and image delivery

Status: ready-for-agent
Implementation: not started
Dependencies: [03](03-research-configuration.md), [25](25-claim-publication-gate.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S7, C5, C10
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Concrete text/photo HTTP integration exists; credentials/live publication are separate activation checks.

## Files and boundaries

- src/adapters/facebook/page.ts
- src/adapters/index.ts
- test/facebook-page.test.ts
- docs/integrations/facebook.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Verify current official Pages API, record supported Graph API version and required permissions; implement built-in adapter for text and photo submission with injected HTTP transport.
2. Use configured Page credentials; match existing submit/bounds/reconcile/cancel contracts. Persist remote identity and distinguish accepted/scheduled/published.
3. Validate caption attribution and asset path/type; upload actual file bytes, not a local path string as remote URL.
4. Implement error taxonomy, token expiry and rate-limit handling with redacted errors. A timeout after create is uncertain and must not trigger blind retry.
5. Document remote capability limits. If future scheduling is unsupported, use local due-time delivery without faking Facebook-confirmed status.

## Acceptance checks

- Fixture text/photo requests include expected payload and map real-shaped responses.
- Timeout-after-create remains uncertain with zero automatic second create.
- Permission error differs from temporary 429; tokens do not appear in logs.
- Post lookup confirms status separately from successful upload.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/facebook-page.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
