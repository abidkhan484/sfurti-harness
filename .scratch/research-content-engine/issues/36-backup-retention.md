# 36 — Back up and restore research lineage and apply retention safely

Status: ready-for-agent
Implementation: not started
Dependencies: [02](02-research-store.md), [16](16-memory-outbox.md), [31](31-refresh-withdrawal.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S6, S8
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Knowledge survives restart, cleanup and memory loss with verified lineage.

## Files and boundaries

- src/maintenance.ts
- src/research/retention.ts
- test/research-backup.test.ts
- docs/setup.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Extend backup manifest to ledger, evidence/media references, hashes and nonsecret policy/config versions; retain existing database backup flow.
2. Implement restore verification in a new target directory; verify reference counts/checksums and rebuild Cognee from ledger.
3. Implement retention preview with source rights, age and dependency checks. Explicit apply removes only eligible unreferenced files/items; retain permitted evidence needed by active/public claim lineage.
4. Remove anonymous expired feedback and downstream memory references through outbox; never claim all derived cache data removed before verification.
5. Document recovery steps and keep backup artifacts outside source-control paths.

## Acceptance checks

- Restore into empty temporary directory resolves every fixture dependency.
- Missing evidence file and checksum mismatch fail verification.
- Referenced evidence is retained despite age; expired unreferenced audience item is previewed accurately.
- Cognee loss recovers from ledger without changing claim approvals.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-backup.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
