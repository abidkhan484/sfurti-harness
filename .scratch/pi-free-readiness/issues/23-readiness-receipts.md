# 23. Add truthful staged doctor and sample attestation

Status: ready-for-agent
Implementation: not started
Depends on: [03](03-codex-auth-persistence.md), [08](08-discovery-recommendations.md), [15](15-review-production-wiring.md), [16](16-telegram-delivery.md), [19](19-facebook-text-photo.md), [21](21-publication-authorization-reconciliation.md), [22](22-posting-window-setup.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S9, and the relevant [contracts](../contracts.md). Existing repository pointers: src/maintenance.ts; src/app.ts; src/config.ts setup; contracts.md Readiness receipts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement configured/locallyTested/connectionsVerified/liveVerified diagnostics for pi-free while keeping existing top-level fields and legacy behavior. Normal doctor performs no external calls and cannot send notifications.
2. Read typed receipts and compute relevant invalidation from Page/operator/model/tool/mission/source/artifact fingerprints. Default connection receipt age is seven days; fixtures cannot satisfy real probes.
3. Compute ready from stages 1–3 plus approved valid sample; report full reserve/throughput/dubbing availability separately. A public Facebook post is not required to bootstrap; liveVerified remains per-format and independent.
4. Implement attest service validating approved version/file/review lineage and existing receipts, storing durable verifiedSample/verifiedAt equivalent without editing read-only config. Reject arbitrary artifact IDs/timestamps or stale hashes.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A17, A27.

Suggested focused tests: test/pi-doctor.test.ts.

Test empty DB, forged flag, approved-but-missing file, stale/fixture receipts, changed Page/model, all local gates and separate Facebook live proof. Assert no HTTP or notification adapter invocation by doctor.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed local staged-readiness implementation. Pi doctor remains read-only; native evidence is manifest-byte-bound; stale/future/fixture connection receipts fail; and sample attestation re-hashes approved source/review lineage. Facebook read-back proof is format-specific and additionally binds the retained current artifact version/hash/file bytes, while remaining independent of bootstrap readiness.
- Changed files: src/deployment/readiness.ts; src/deployment/contracts.ts; src/maintenance.ts; src/app.ts; test/pi-contracts.test.ts; test/pi-doctor.test.ts
- Tests and actual results: `node --test test/pi-doctor.test.ts` passed (2/2); `node --test test/pi-contracts.test.ts` passed (1/1); `npm run typecheck` passed; `git diff --check` passed. `npm run lint` cannot run because this environment resolves ESLint 6.4.0 without the repository’s modern configuration. The restricted sandbox cannot execute the Node child fixtures in `test/adapters.test.ts`.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: aggregate configuration fingerprints deliberately invalidate all receipts on a relevant Page/operator/model/tool/mission change; no on-device/account evidence is claimed. Real native, Codex/search/Page/Telegram, and format-specific publication receipts remain operator work.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-15: Added retained-file/version binding for live read-back fixture proof. Doctor performed no external call or notification.
