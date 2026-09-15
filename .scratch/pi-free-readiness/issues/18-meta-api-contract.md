# 18. Verify and record the current Meta API contract

Status: ready-for-agent
Implementation: not started
Depends on: [01](01-pi-profile-contracts.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S7, and the relevant [contracts](../contracts.md). Existing repository pointers: docs/integrations.md; src/adapters/index.ts ProcessFacebook; src/planning.ts; source-notes.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Fetch official Meta Page posts/photo/video/Reels/token/permissions docs; retry the earlier spec-session 429 using official pages or authenticated operator-accessible documentation if necessary. Do not use third-party snippets as API truth.
2. Create docs/integrations/facebook-api-contract.md recording explicit supported API version, exact method/path/body/response for each operation, required scopes/Page roles, token check/expiry, upload/processing phases, polling and format-specific scheduling/cancellation limits.
3. Specify what can be authoritatively reconciled with and without remote ID. Mark unsupported lookup as unknown. Define local due-time dispatch where future scheduling is unsupported, including a compatible bounds capability extension.
4. Add sanitized schema fixtures from documented shapes with provenance. No live post, token acquisition or account mutation. If official contracts cannot be verified, complete accessible formats and mark unresolved format blocked rather than inventing it.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A21, A22.

Suggested focused tests: Documentation/schema fixture validation only.

Dependent Facebook implementation starts only for documented verified operations. Record sources/access dates and all account-specific prerequisites. This is agent research, not a request for the user to design endpoints.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed verified-documentation contract for Page text/photo and Page Reels using the configured explicit Graph API version (`v26.0`). It remains disabled/mockable until account capability is explicitly authorized and verified.
- Changed files: docs/integrations/facebook-api-contract.md; test/pi-facebook-contract.test.ts
- Tests and actual results: `node --test test/pi-facebook-contract.test.ts` passed (1/1); `npm run typecheck` passed; `npm run lint` passed with 136 existing warnings and no errors. `git diff --check` failed on an unrelated pre-existing `.gitignore:41: new blank line at EOF`. The restricted sandbox could not run `test/adapters.test.ts` because its child-process fixture lacks stdin/stdout; the isolated unrestricted rerun passed (10/10), and unrestricted `npm test` passed (108/108).
- Native ARM64 or external verification: no account/API verification performed.
- Remaining blockers/limitations: Page identity, Page token expiry/scopes/tasks, app-review/features, Page/Reels eligibility, and a read-only capability probe remain unverified and require explicit authorization. Reels have no documented future scheduling/cancellation operation, so local due-time dispatch and unknown-outcome preservation remain required.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Official-documentation lookup was attempted without account access and did not return retrievable Meta results. The record intentionally blocks mutation implementation instead of guessing endpoints or claiming Page capability.

2026-09-14: Read the official Pages API Posts guide, Reels Publishing API guide, and Graph API Explorer Guide without login, Explorer token generation, permission grants, or API queries. The local non-secret `GRAPH_API_VERSION` selection was checked without printing configuration values and matches the official `v26.0` examples. Recorded paths/shapes, prerequisites, Page-post scheduling bounds, Reels upload/resume/status lifecycle, and the Reels rate limit. No credential, token, secret, Page ID, API response, or Page mutation was read, copied, logged, or committed.
