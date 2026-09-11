# 22 — Compose original Bangla explainers with narration and captions

Status: ready-for-agent
Implementation: not started
Dependencies: [20](20-image-scene-rendering.md), [21](21-piper-bangla-tts.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S7, C3, C5
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

A playable narrated MP4 exists using the new original mode, with reproducible provenance.

## Files and boundaries

- src/content/render-video.ts
- test/video-composition.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Combine scene PNGs and per-scene Piper audio using configured FFmpeg; derive durations from actual audio and bounded transitions.
2. Render 1080x1920 30–60-second H.264/AAC MP4; include timed Bangla captions derived from scene/script timings and preserve scene manifest.
3. Use actual audio duration to request script revision when out of bounds; do not speed speech excessively or silently cut claims.
4. Store output integrity and asset provenance; original_explainer does not require external source-video segments.
5. Run commands using argument arrays and generated safe file paths, with timeout/cleanup limited to this job's temporary directory.

## Acceptance checks

- Real short fixture with audible input renders correct codecs, dimensions and duration.
- Long audio yields revision request rather than truncation.
- An original explainer with zero source video IDs renders successfully; invalid local assets fail.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/video-composition.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
