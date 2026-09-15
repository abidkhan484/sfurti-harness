# 13. Add permission-gated local Bangla dubbing

Status: ready-for-agent
Implementation: not started
Depends on: [05](05-arm64-toolchain.md), [06](06-bounded-storage.md), [10](10-bangla-editorial-decisions.md), [12](12-licensed-clip-renderer.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S3, S5–S6, and the relevant [contracts](../contracts.md). Existing repository pointers: src/config.ts tts; docs/research/piper-bn-bd-setup.md; src/domain.ts translation permission. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement Piper behind a typed local interface using configured runtime, bn_BD voice/config/model hashes and license manifest. Start with speaker 0 as a candidate, not an automatically approved production voice.
2. Require translate permission, preserved source transcript and reviewed Bangla translation; normalize spoken numbers while retaining original text. Keep duration/context/segment lineage and verify narration/subtitle synchronization.
3. Gate actual use on an explicit valid voice quality receipt. Missing model/approval holds foreign-source work and leaves original Bangla production available. No paid or different-locale fallback.
4. Use the same heavy-work admission and idempotent manifests. Dubbing is a conditional capability, not required for the first original-Bangla sample; document it as unavailable until real listener/native checks pass.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A16.

Suggested focused tests: test/pi-dubbing.test.ts.

Fixture tests cover absent translate scope, hash mismatch, unavailable voice, normalization, duration overrun and refusal to enable by configuration alone. Real voice audition remains operator evidence.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level dubbing eligibility gate. Foreign sources require translate scope, preserved transcript, reviewed Bangla translation, an approved bn_BD-google-medium listener-quality receipt, valid speaker range and matching model/config hashes; numeric speech normalization retains the original text separately.
- Changed files: src/adapters/local/dubbing.ts; test/pi-dubbing.test.ts
- Tests and actual results: `node --test test/pi-dubbing.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 126 warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: Piper process execution, WAV duration/audio synchronization, voice rights and Bangladeshi listener review remain unavailable pending native/operator evidence. This does not affect original-Bangla clip production.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only permission and provenance gate; no voice model was downloaded, no provider was selected, and no synthetic audio was generated.
