# 03. Persist ChatGPT auth safely across isolated Codex tasks

Status: ready-for-agent
Implementation: not started
Depends on: [01](01-pi-profile-contracts.md), [02](02-secret-and-tool-boundaries.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S4, S8, and the relevant [contracts](../contracts.md). Existing repository pointers: src/adapters/codex.ts; src/adapters/llm.ts; test/adapters.test.ts; docs/integrations.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Use the installed SDK and current official auth docs; support the profile's dedicated writable auth directory and reject API-key auth without printing credential contents. Verify auth method with installed CLI behavior, not a guessed token field alone.
2. Serialize access to the authoritative auth cache. Copy current auth into an isolated task home, then atomically preserve valid refreshed auth even after a failed turn. Fence concurrent/stale refresh writes and keep restrictive permissions.
3. Preserve disabled tools, clean environment and separate role homes. Support task-specific persistent session directories for ticket 04 without sharing generator/reviewer histories or loading host skills/config.
4. Provide a bounded explicit inference probe returning sanitized identity/model/capability receipt input. Ordinary doctor performs only local inspection. Document headless login and cache ownership; no login or real inference is executed by unit tests.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A02, A03, A05.

Suggested focused tests: test/pi-codex-auth.test.ts.

Simulate refresh on success/error, restart, stale concurrent write and API-key environment injection. Auth survives recreation; tokens never appear in output.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed locally. Added isolated ChatGPT-session cache copying, serialized atomic refresh persistence with stale-write fencing, Pi API-key rejection, sanitized probe receipt input, and per-task isolated Codex homes.
- Changed files: src/adapters/codex.ts; src/deployment/codex-auth.ts; test/pi-codex-auth.test.ts
- Tests and actual results: `node --test test/pi-codex-auth.test.ts` passed (1/1); `npm run typecheck` passed; `npm run lint` passed with 117 pre-existing warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed; no login or real inference was executed.
- Remaining blockers/limitations: Pi operator must perform headless ChatGPT login and ticket 29 must establish an actual inference receipt. Session continuation is implemented by ticket 04.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only completion. The OpenAI Docs configuration reference was consulted for isolated configuration boundaries; no credentials were read or printed.
