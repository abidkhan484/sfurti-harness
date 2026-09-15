# 14. Collect independent evidence from finished artifacts

Status: ready-for-agent
Implementation: not started
Depends on: [05](05-arm64-toolchain.md), [06](06-bounded-storage.md), [11](11-text-image-renderer.md), [12](12-licensed-clip-renderer.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S6, and the relevant [contracts](../contracts.md). Existing repository pointers: src/production.ts inspect; src/adapters/index.ts media.inspect; src/domain.ts review schemas. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement text readback, actual image/frame inspection inputs and video ffprobe/decode/ASR/audio analysis. Sample start/end/cuts and at most two-second intervals with correct output timestamps.
2. Read final retained output independently of editor manifests; producer scripts cannot substitute for ASR or observed pixels. Save tool/hash/coverage/time metadata and uncertain spans, including missing audio or unsupported inspections.
3. Compute silence/clipping/level signals and transcript coverage; define explicit conservative validity criteria and record their thresholds. ASR disagreement or unreadable layout must fail/hold relevant evidence, never infer complete listening.
4. Return the existing required evidence shape with valid false and actionable reasons when incomplete. Keep resource/lease bounds and deterministic fixture seams; dubbing output must undergo the same actual-output inspection.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A15, A16.

Suggested focused tests: test/pi-media-inspection.test.ts.

Silent/corrupt/rotated/wrong-aspect video, wrong timestamps, missing frame, gibberish ASR and producer-forged evidence all fail as appropriate. Native Bangla fixture records real limitations.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level independent-output inspection contract. It derives retained-output integrity itself and returns conservative invalid results for incomplete video duration/aspect/frame/transcript/audio/coverage evidence.
- Changed files: src/adapters/local/inspection.ts; test/pi-media-inspection.test.ts
- Tests and actual results: `node --test test/pi-media-inspection.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 127 warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: real ffprobe/decode/ASR/audio analysis remains native-tool work; fixture inputs do not establish true pixel readability, audio intelligibility, codec correctness, or Bangla ASR quality. Those must remain visible in ticket 29.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only conservative validator; editor manifests and assertions are not treated as inspection evidence.
