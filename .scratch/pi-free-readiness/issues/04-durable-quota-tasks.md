# 04. Complete durable quota deferral and role-specific resumption

Status: ready-for-agent
Implementation: not started
Depends on: [03](03-codex-auth-persistence.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S6, S8, and the relevant [contracts](../contracts.md). Existing repository pointers: src/adapters/codex.ts; src/adapters/llm.ts; src/production.ts; src/coordinator.ts; src/store.ts; docs/adr/0003-durable-deferral-for-llm-provider-quotas.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Persist stage/task/role/provider/model/session identity, completed checkpoints and nextRunAt before yielding work. Implement resumeThread for the same task where supported; each initial review starts fresh and only its own interrupted review may resume.
2. Classify installed SDK quota/auth/transient outcomes using sanitized fixtures. Share account exhaustion gates across routes; use explicit reset information when available and bounded exponential probes otherwise (initial 5 min, cap 6 h). Do not invent remaining allowance.
3. Remove Pi-profile dependence on global production backoff as the sole state: release workers while deferred and allow completed media delivery/reconciliation. Keep completed steps and editorial iteration counts unchanged by quota events.
4. Reject automatic model/provider switching. Missing resumable state yields needs-attention with a clear recovery reason, not a fresh invisible generation. Fence obsolete workers and honor aborts.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A04, A05.

Suggested focused tests: test/pi-quota.test.ts.

Crash/restart during generation and review; shared quota blocks both, then resumes original sessions after clock advancement. Confirm no duplicate render or corrective iteration, no busy loop and no paid fallback.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed locally. Added durable account-scope quota deferral with original provider/model/session routing retained, bounded 5-minute-to-6-hour retries, and Pi-only route gating instead of global production backoff.
- Changed files: src/deployment/quota.ts; src/production.ts; test/pi-quota.test.ts
- Tests and actual results: `node --test test/pi-quota.test.ts` passed (1/1); `npm run typecheck` passed; `npm run lint` passed with 117 pre-existing warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed.
- Remaining blockers/limitations: an actual SDK resumeThread capability and live quota/reset receipt need ticket 29/operator verification; missing persisted session is held rather than regenerated.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only completion with no provider/model fallback and no external inference.
