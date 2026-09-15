# 20. Implement resumable Reel upload and processing

Status: ready-for-agent
Implementation: not started
Depends on: [12](12-licensed-clip-renderer.md), [19](19-facebook-text-photo.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S7, and the relevant [contracts](../contracts.md). Existing repository pointers: proposed src/adapters/facebook.ts; src/planning.ts Post; verified docs/integrations/facebook-api-contract.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement the verified Reel upload/create/transfer/finish/status sequence, streaming file bytes with cancellation and size limits. Persist session/video IDs and offsets/phases after each confirmed transition.
2. Resume existing upload/process state on restart instead of starting another Reel. Distinguish processing, scheduled, published, failed and uncertain; upload acknowledgement never means publication.
3. Apply documented format-specific scheduling support or local due-time capability contract. Validate current approved artifact hash and Page identity before each mutation.
4. Bound processing polls and preserve unknown state on timeout. Reject expired session/corrupt upload with recoverable recorded reason; do not erase remote attempts to retry.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A21, A22.

Suggested focused tests: test/pi-facebook-reels.test.ts.

Exercise restart after each phase, delayed processing, upload rejection, wrong hash, timeout after finish and preview mode. Prove same upload session is resumed.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: fixture-level, resumable Graph Reel start/transfer/inspect/finish transport. It streams the locally supplied artifact to the explicit-version rupload endpoint, hashes the current artifact, validates optional Page/hash identity, persists immutable intent plus phase state (session/video ID, upload URL, acknowledged offset, file size and outcome), and holds ambiguous outcomes as `unknown`. Upload and finish acknowledgements remain `uploaded`/`processing`, never publication. Reel-specific bounds retain local due-time dispatch and declare no remote scheduling/cancellation contract.
- Changed files: src/adapters/facebook.ts; src/adapters/index.ts; test/pi-facebook-reels.test.ts
- Tests and actual results: `node --test test/pi-facebook-reels.test.ts` passed (3/3); `npm run typecheck` passed; `npm run lint` passed with 137 existing warnings and no errors; unrestricted `npm test` passed (114/114). `git diff --check` passed for unstaged changes. `git diff --cached --check` remains blocked by unrelated pre-existing `.gitignore:41: new blank line at EOF` and pre-existing `docs/integrations/facebook-api-contract.md:3: trailing whitespace`.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: All requests used synthetic local files and mocked HTTP. No token, Page identity, scope/task, eligibility, upload, processing status, scheduling, cancellation, account, ARM64, or real HTTP verification was performed. Ticket 21 still owns publication authorization and reconciliation integration; this ticket only provides the resumable adapter state machine.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-15: Implemented only the fixture-backed Reel transport. No login, token generation, permission grant, Graph API request, Facebook mutation, Telegram send, publication, commit, push, or credential access occurred. Preview rejection is tested before token-file resolution or HTTP; lost responses are journaled as unknown and are not retried automatically.
