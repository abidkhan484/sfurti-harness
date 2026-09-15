# 16. Implement durable private Telegram media delivery

Status: ready-for-agent
Implementation: not started
Depends on: [01](01-pi-profile-contracts.md), [02](02-secret-and-tool-boundaries.md), [06](06-bounded-storage.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S7, and the relevant [contracts](../contracts.md). Existing repository pointers: src/notifications.ts; src/adapters/index.ts delivery; src/adapters/telegram.ts; source-notes.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement built-in telegram.deliver with private operator ID, token-file resolution, actual multipart attachments and bounded HTTP. Persist an operation journal and returned message/file IDs per component.
2. Respect hosted API size limits verified from official docs. Oversize publication media gets a separately labeled bounded preview derivative when possible; never claim an inaccessible local file path was delivered.
3. Confirmed retries return prior results. Lost response or crash with ambiguous send stays unknown/held and is not auto-resent. Extend outbox states/backoff minimally so these are not retried forever; no exactly-once guarantee.
4. Format recommendation/sample/status notifications clearly in Bangla, redact secrets and exclude private permission evidence. Delivery remains disabled in sample preview unless setup-send explicitly selects an artifact.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A17, A19, A20.

Suggested focused tests: test/pi-telegram-delivery.test.ts.

Use fake HTTP for send success, 429, oversized file, partial attachments, token error and timeout after remote acceptance. Verify no duplicate known send and no secret leakage.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level built-in private Telegram delivery. It resolves the token file only at send time, checks the hosted 50 MiB attachment limit, posts multipart attachment bytes, journals intent/confirmed message and file IDs, replays known success and holds a lost response without automatic resend.
- Changed files: src/adapters/telegram.ts; test/pi-telegram-delivery.test.ts
- Tests and actual results: `node --test test/pi-telegram-delivery.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 127 warnings and no errors; `git diff --check` passed; `npm test` passed (105/105).
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: this is an injected HTTP fixture seam; it is not configured into preview delivery, no token file/account was used, and real Telegram response/reconciliation behavior remains operator verification. Oversized artifacts are held; preview-derivative generation is deferred to the explicit setup workflow.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only delivery implementation. Official hosted Bot API documentation was checked for the 50 MiB multipart/send limit; no Telegram message was sent.
