# 02. Implement private secret loading and bounded native tools

Status: ready-for-agent
Implementation: not started
Depends on: [01](01-pi-profile-contracts.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S3–S4, S7, and the relevant [contracts](../contracts.md). Existing repository pointers: src/adapters/process.ts; src/adapters/index.ts; src/app.ts; src/planning.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Create src/deployment/secrets.ts resolving token-file references only at the concrete adapter boundary; reject unreadable files and redact error/config/status output. Do not inject Page/Telegram secrets into Codex or media children.
2. Create src/adapters/local/runner.ts with executable/argument arrays, shell=false, explicit environment, cancellation, process-group termination, deadline and bounded stdout/stderr. Return classified errors without echoing raw secret-bearing commands.
3. Use bounded native-tool output paths and isolated task directories. Browser rendering disables external navigation/resources and arbitrary script from content. Keep existing sfurti/1 ProcessAdapter behavior compatible.
4. Audit publicConfig/safeConfig/notification snapshots so new config/receipt types cannot expose token/auth contents. Do not read real credentials in tests.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A02, A05, A14.

Suggested focused tests: test/pi-boundaries.test.ts.

Use a child fixture to prove abort/timeout kills descendants and ambient secret variables are absent. Test missing secret file and redaction with synthetic sentinel values.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed locally. Added token-file-only resolution/redaction and an argument-array local native-tool runner with clean environment, output bounds, cancellation/deadline, and process-group termination.
- Changed files: src/deployment/secrets.ts; src/adapters/local/runner.ts; src/app.ts; test/pi-boundaries.test.ts
- Tests and actual results: `node --test test/pi-boundaries.test.ts` passed (1/1); `npm run typecheck` passed; `npm run lint` passed with 117 pre-existing warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed; synthetic files and `/bin/sh` fixtures only.
- Remaining blockers/limitations: concrete Telegram/Page adapters and browser renderer are implemented by later tickets; no actual credential file, native media process, or account was accessed.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Completed fixture-testable ticket 02 after ticket 01. No token was read except a temporary synthetic test token, and no network, notification send, publication, commit, or deletion action was performed.
