# 10 — Add opt-in authenticated browser collection without making it required

Status: ready-for-agent
Implementation: not started
Dependencies: [03](03-research-configuration.md), [08](08-http-collection.md), [09](09-document-extraction.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S2, S6, C5
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Optional browser path works against a local fixture; actual account access is a separately reported setup condition.

## Files and boundaries

- src/adapters/collection/browser.ts
- test/browser-collection.test.ts
- docs/integrations/browser-collection.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement a Playwright collector for explicitly configured origins/profile references, using a user-established dedicated session; public web discovery remains usable when it is disabled.
2. Collect bounded visible article/discussion content using per-origin extraction rules or general text fallback marked partial. Preserve permalinks and timestamps; reuse extraction/redaction.
3. Pause connector on login/checkpoint/expired session; return authentication_required without consuming editorial retries. Never persist cookies in ledger/prompts/logs.
4. Document session creation and collection-access prerequisites. Enforce page/time budgets; no stealth, challenge bypass, account rotation or automatic joining/posting.

## Acceptance checks

- Local authenticated fixture collects allowed origin and denies another origin.
- Expired session pauses one connector and makes zero credential attempts.
- Disabled connector has no browser launch and does not fail baseline research cycle.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/browser-collection.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
