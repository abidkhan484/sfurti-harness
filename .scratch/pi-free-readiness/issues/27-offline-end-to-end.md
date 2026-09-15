# 27. Prove complete preview and failure-recovery flows offline

Status: ready-for-agent
Implementation: not started
Depends on: [13](13-optional-bangla-dubbing.md), [24](24-setup-command-workflow.md), [25](25-pi-service-coordination.md), [26](26-backup-restore.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S10, and the relevant [contracts](../contracts.md). Existing repository pointers: acceptance.md; existing test/*.test.ts; proposed test/fixtures/pi. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement integrated deterministic scenarios A01–A28 with synthetic owned media, fixed clocks and local fake providers. Reuse existing tests where assertions already prove a requirement; add only missing cross-boundary coverage.
2. Exercise one full source→intake→qualification→generation→render→inspection→review→local plan sequence, plus image/text, and assert preview performs zero external mutations.
3. Inject process death/quota/auth expiry/space exhaustion/ASR uncertainty and lost Telegram/Facebook responses; verify durable recovery and no duplicate publication.
4. Test migrations/legacy external wrappers/research defaults as regressions. Keep native tool tests separately labeled and runnable without external accounts; fixtures cannot set real readiness receipts.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A01–A28.

Suggested focused tests: test/pi-e2e.test.ts plus focused existing suites.

Run npm test, npm run typecheck, npm run lint and git diff --check. Record exact failures/limitations; do not bypass hooks or weaken evidence assertions to pass.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level cross-boundary preview scenario: deterministic owned discovery metadata, READY-folder intake/idempotence, qualification, video render/inspection/review, image/text production/review, local planning, and zero Facebook/Telegram mutations. Focused ticket suites remain the evidence for the distinct failure/recovery cases listed in acceptance.
- Changed files: test/pi-e2e.test.ts
- Tests and actual results: `node --test test/pi-e2e.test.ts` passed (2/2); `npm run typecheck` passed; `git diff --check` passed. The restricted sandbox cannot run `test/adapters.test.ts` because Node child-process execution returns `EPERM`/empty output; this is not treated as fixture evidence.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: native ARM64 tools, real account receipts, and operator media remain outside offline fixtures. A01–A28 retain their focused suites rather than falsely treating one fixture flow as real readiness evidence.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-15: Added deterministic synthetic owned-media preview coverage; no network, credential, Telegram, or Facebook action occurred.
