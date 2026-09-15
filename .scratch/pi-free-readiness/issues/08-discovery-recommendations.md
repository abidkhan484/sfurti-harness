# 08. Connect free discovery to ranked video recommendations

Status: ready-for-agent
Implementation: not started
Depends on: [03](03-codex-auth-persistence.md), [04](04-durable-quota-tasks.md), [05](05-arm64-toolchain.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S4–S5, and the relevant [contracts](../contracts.md). Existing repository pointers: src/adapters/search/searxng.ts; src/research/url-policy.ts; src/production.ts discover; src/adapters/index.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement a built-in discovery adapter using existing SearXNG search and the explicit Codex search route for bounded query/ranking decisions. Map stable keywords/sources/matches to the legacy contract with canonical URL/source identity.
2. Enforce spec budgets, cached daily request IDs, safe HTTP/redirect policy and timeout/backoff. A failed engine/result records partial coverage; do not bypass challenges or use paid fallback. General research activation is not required.
3. Save recommendation records with Bangla rationale, topic, observed language/unknown, original URL and evidence. Metadata-only hits stay unqualified. Timestamp suggestions require locators or are absent/tentative.
4. Queue at most five distinct recommendation notifications per topic/day, each explaining submission ID and permission/upload procedure. No media download, permission inference, raw source instructions or direct Telegram send.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A05, A06, A12.

Suggested focused tests: test/pi-discovery.test.ts.

Use SearXNG fixture responses for duplicates, 403 JSON disabled, 429, malformed hits and untrusted instructions. Verify accurate legacy match references and recommendation dedupe.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level bounded SearXNG metadata discovery. Canonical duplicate hits produce unqualified recommendations with empty tentative segments; local recommendation guidance is queued only and never downloads media, infers permission, or sends Telegram.
- Changed files: src/adapters/local/discovery.ts; src/adapters/index.ts; src/production.ts; test/pi-discovery.test.ts
- Tests and actual results: `node --test test/pi-discovery.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 123 warnings and no errors; `git diff --check` passed; `npm test` had 24 passing test files and one intermittent `test/adapters.test.ts` file-level failure, while an immediate isolated rerun passed 10/10.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: ticket 29 must verify configured SearXNG JSON/redirect behavior and useful operator-reviewed results on the Pi. The stable local query set is deliberately conservative; no result becomes permissioned or qualified.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Implemented locally with synthetic SearXNG responses. Partial coverage records an explicit limitation rather than falling back to another provider or fabricating a candidate; no live service, Codex inference, or notification was used.
