# 23 — Inspect actual rendered Bangla text and audio independently

Status: ready-for-agent
Implementation: not started
Dependencies: [20](20-image-scene-rendering.md), [22](22-original-video-composition.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S7, C5
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Inspector returns independent observations and explicit limitations for final review.

## Files and boundaries

- src/adapters/media/inspect.ts
- test/media-inspection.test.ts
- docs/integrations/media-tools.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement FFprobe metadata, FFmpeg scene/frame sampling and audio silence/clipping checks, with measured coverage.
2. Add configured local OCR and ASR command adapters with shipped runnable wrappers/config examples; select and pin tools supporting Bangla, such as Tesseract ben and multilingual Whisper.
3. Read actual artifact pixels/audio; expected script is comparison input only. Produce OCR/asr observations, timestamps and normalization-aware discrepancies.
4. Missing required OCR/ASR capability defers final review instead of presenting expected script as observed evidence. Low-confidence discrepancy is not automatically proof of incorrect content.

## Acceptance checks

- Changed number in rendered fixture is caught against expected script.
- Silent video and audio track missing are rejected.
- Inspector cannot return expectedScript as observed transcript in absence of ASR output.
- Coverage includes every scene; tool failure is reported unavailable, not pass.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/media-inspection.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
