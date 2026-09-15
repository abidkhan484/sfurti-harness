# 19. Implement Page capability probes and text/photo submission

Status: ready-for-agent
Implementation: not started
Depends on: [02](02-secret-and-tool-boundaries.md), [18](18-meta-api-contract.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S7, and the relevant [contracts](../contracts.md). Existing repository pointers: src/adapters/index.ts ProcessFacebook; src/planning.ts; proposed src/adapters/facebook.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement typed built-in Facebook transport from the verified contract, explicit version/Page ID/token file, with bounded requests, redacted failures and injectable HTTP.
2. Implement read-only identity/permissions/capability probe and format bounds. Reject wrong Page, missing capability and expired credentials with actionable reasons; passing probe is not publication proof.
3. Implement text/photo operations with intent journal written before request, content hash and returned remote IDs persisted before result. Preview mode blocks mutations even if called directly.
4. Use supported scheduling semantics only. Return actual remote status, not published on upload receipt. Defer reconciliation integration to ticket 21 but persist sufficient attempt state now.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A18, A21, A22.

Suggested focused tests: test/pi-facebook-text-photo.test.ts.

Fake API verifies exact documented requests, pagination where needed, auth failure, wrong Page, response lost and preview refusal. No real tokens/posts in tests.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: fixture-level typed Graph Page transport. It requires explicit API version/Page ID/token-file reference, journals intent before a future mutation, supports documented text/photo request shapes, and rejects all direct mutation in preview before resolving a token or calling HTTP.
- Changed files: src/adapters/facebook.ts; src/adapters/index.ts; test/pi-facebook-text-photo.test.ts
- Tests and actual results: `node --test test/pi-facebook-text-photo.test.ts` passed (3/3); `npm run typecheck` passed; `npm run lint` passed with 136 existing warnings and no errors; unrestricted `npm test` passed (111/111). `git diff --check` remains blocked by the unrelated pre-existing `.gitignore:41: new blank line at EOF`.
- Native ARM64 or external verification: not performed; mock HTTP and synthetic token files only.
- Remaining blockers/limitations: Page identity/task/scope/token-expiry capability verification requires a separately authorized real read-only probe. Concrete remote reconciliation and cancellation remain ticket 21; Reel transfer/processing remains ticket 20. The current Graph built-in is not selected unless the explicit `kind: "graph"` integration is configured, and no configured adapter was invoked.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Implemented the disabled/mockable Page text/photo transport from ticket 18's official documentation contract. No environment credential, token, Page ID, API response, HTTP request, Telegram send, Facebook mutation, commit, or publication was used. The full regression suite was run outside the restricted child-process sandbox only; it performed fixture/local tests and passed.
