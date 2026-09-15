# 12. Render permitted clips with original Bangla audio

Status: ready-for-agent
Implementation: not started
Depends on: [05](05-arm64-toolchain.md), [06](06-bounded-storage.md), [10](10-bangla-editorial-decisions.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S5–S6, and the relevant [contracts](../contracts.md). Existing repository pointers: src/production.ts editor.create and segments; proposed src/adapters/local/editor.ts; src/domain.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement video branch using FFmpeg/ffprobe for one allocated exact original interval set. Enforce 30–60 seconds, vertical 1080×1920, H.264/AAC; preserve original Bangla audio and contextual sequence.
2. Fit/pad by default, with safe caption zones and libass Bangla subtitles. Validate any crop decision against frame evidence; never alter reserved source start/end mappings to make a render pass.
3. Use software encoding, two-thread cap, stage deadline/admission/lease protection. Save intermediate manifest and atomic final output keyed by artifact version, so lost process response can recover the completed render.
4. Track overlay/font/source provenance and output size. Keep publication-quality artifact separate from any delivery preview derivative. No unauthorized source acquisition, stock music or synthetic filler.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A13, A15.

Suggested focused tests: test/pi-clip-render.test.ts.

Render a synthetic owned 35-second clip and check duration/aspect/codecs/audio/segments. Test cancellation, corrupt input, subtitle metacharacters and exact replay after completed output.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level local FFmpeg clip renderer. It only accepts one exact 30–60 second allocated interval, uses fit/pad and local libass subtitles, limits software encoding threads to two, atomically retains a completed artifact and records source/segment/font provenance.
- Changed files: src/adapters/local/editor.ts; test/pi-clip-render.test.ts
- Tests and actual results: `node --test test/pi-clip-render.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 125 warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: the focused test proves interval/replay behavior without invoking FFmpeg. Real source duration, H.264/AAC codecs, audio preservation, subtitles, corruption/cancellation handling and ARM64 performance must be verified during ticket 29 with operator-owned permitted media.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only renderer implementation; no footage was acquired, no source mapping changed, and no delivery/publication derivative was created.
