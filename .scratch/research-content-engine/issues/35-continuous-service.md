# 35 — Run the complete research-content loop with durable budgets

Status: ready-for-agent
Implementation: not started
Dependencies: [16](16-memory-outbox.md), [27](27-production-coordination.md), [30](30-audience-feedback.md), [31](31-refresh-withdrawal.md), [33](33-critical-exceptions.md), [34](34-application-cli.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S2, S8, C7–C8
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Enabled service cycles sustain the loop without manual per-stage commands.

## Files and boundaries

- src/service.ts
- src/research/cycle.ts
- src/coordinator.ts
- test/research-service.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Add independent phases for discovery/triage/validation, memory sync, content production, publication, feedback and refresh to service-cycle when enabled.
2. Persist due schedules and budget reservations using Asia/Dhaka day boundaries; global research+content tasks obey existing limits and quotas.
3. Reuse leases/checkpoints, prioritize containment/expiry, and release workers on deferred provider capacity. Failed connector does not block unrelated phases.
4. Implement dryRun with proposed jobs/counts only and no mutations/external calls.
5. Limit recursion: new feedback creates next-cycle work, not an unbounded same-cycle search loop.

## Acceptance checks

- A simulated week progresses from discovery through feedback and new questions.
- Search outage does not stop eligible publication; quota deferral does not consume editorial retries.
- Restart at midnight preserves sealed daily config/budget and resumes checkpoints.
- Dry run calls zero external adapters and changes zero records.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-service.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
