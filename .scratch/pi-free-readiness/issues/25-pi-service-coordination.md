# 25. Run bounded intake, discovery and production continuously

Status: ready-for-agent
Implementation: not started
Depends on: [04](04-durable-quota-tasks.md), [06](06-bounded-storage.md), [08](08-discovery-recommendations.md), [09](09-source-qualification.md), [17](17-telegram-polling.md), [21](21-publication-authorization-reconciliation.md), [24](24-setup-command-workflow.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S4–S8, and the relevant [contracts](../contracts.md). Existing repository pointers: src/service.ts; src/coordinator.ts; src/production.ts; src/notifications.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Schedule independent intake/discovery/qualification/production/notification/reconciliation phases using durable due records and bounded concurrency. Only one heavy native stage and one Codex task at a time.
2. Replace exact-minute-only Pi scheduling with idempotent due opportunities so restarts/long renders do not miss daily work. Preserve daily snapshots, custom separation, three-source diversity and five-item target.
3. Source or quota shortage must not consume all attempts before text/image work. Keep future reserve filling subordinate to current-day deficits and explicit storage/LLM budgets; report unmet coverage without changing 90 days.
4. Renew/fence leases for long stages and ensure polling/reconciliation can progress during rendering. Preview starts local work only; live writes require stored activation. Default Compose service still runs doctor until explicit start.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A04, A12, A18, A25, A26.

Suggested focused tests: test/pi-service.test.ts.

Advance fake clock across scheduled minutes/restart, exhaust sources/quota/space, run two coordinators and abort a stage. Verify no duplicate daily slots or starvation of independent work.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed local service coordination. Service phases claim/renew/fence durable leases and distinct native/Codex permits; due opportunities survive missed minutes; preview retains notifications locally; and independent phases progress during long work. Pi low-space deferral preserves the 90-day coverage target without creating partial artifacts. After a stale lease expiry, a second coordinator can finish the durable request while the stale owner is fenced from overwriting its artifact.
- Changed files: src/service.ts; src/store.ts; src/app.ts; src/coordinator.ts; src/maintenance.ts; test/pi-service.test.ts
- Tests and actual results: `node --test test/pi-service.test.ts test/pi-publication-gate.test.ts` passed; `npm run typecheck` passed; `git diff --check` passed. Lint environment limitation and restricted-child-process full-suite result are recorded in ticket 23.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: current-day image/text slots run before video slots, preserving independent work when video is source/quota constrained. Fixture leasing proves fencing after an artificial expiry but does not establish real Pi throughput, external polling, Telegram, Facebook, or network activity.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.
