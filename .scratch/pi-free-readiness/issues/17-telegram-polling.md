# 17. Implement resumable private Telegram operator polling

Status: ready-for-agent
Implementation: not started
Depends on: [16](16-telegram-delivery.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S7, and the relevant [contracts](../contracts.md). Existing repository pointers: src/service.ts; src/adapters/telegram.ts; src/app.ts command dedupe; src/store.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement telegram.poll using bounded long polling and a durable received-update queue. Persist fetched updates before advancing offset; process/ignore through TelegramOperator and mark completion afterward.
2. Only the configured private sender/chat can invoke actions. Preserve integer update IDs and existing command dedupe. Group/bot/other-user messages are ignored without exposing internal content.
3. Provide polling on its own bounded loop so a 30-minute render cannot stop command receipt. Enforce execution-mode/live-action gates even on authenticated input; payload cannot elevate preview.
4. Detect competing webhook/poller configuration and report actionable setup failure without silently deleting another webhook. Redact message content containing secrets from diagnostics.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A18, A20.

Suggested focused tests: test/pi-telegram-poll.test.ts.

Crash after fetch, after durable receipt and after command execution; verify no lost updates or duplicate commands. Test unauthenticated updates, poison JSON and polling cancellation.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level durable polling receipt queue. Updates are durably stored before dispatch; processed receipts are not reprocessed on the next service cycle, and dispatch failures become held records rather than lost offsets.
- Changed files: src/store.ts; src/service.ts; src/app.ts; test/pi-telegram-poll.test.ts
- Tests and actual results: `node --test test/pi-telegram-poll.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 127 warnings and no errors; `git diff --check` passed; `npm test` passed (106/106).
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: fixture process transport does not exercise real Telegram long polling, webhook-conflict detection or remote offsets. Preview/live action gates remain application-owned and must still be exercised by explicit setup/operator tests.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only receipt/dispatch recovery implementation. No polling request, webhook mutation, or Telegram command was sent to an external account.
