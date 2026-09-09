# 20 — Render Bangla image posts and video scene frames

Status: ready-for-agent
Implementation: not started
Dependencies: [03](03-research-configuration.md), [19](19-bangla-content-generation.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S7, C5
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Real PNG outputs and manifests exist; a screenshot stub does not satisfy this ticket.

## Files and boundaries

- src/content/render-scenes.ts
- src/content/templates/
- test/scene-rendering.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement deterministic local HTML/CSS template rendering through Playwright with an installed/versioned Bangla font.
2. Render image posts at 1080x1080 and video scenes at 1080x1920; escape all copy and load only explicit local assets.
3. Generate scene manifest with text, bounds, asset/font hashes and intended duration; preserve source/voice attribution requirements.
4. Measure overflow, missing glyphs and safe-area violations; fail or request copy correction rather than silently clipping or shrinking to unreadability.

## Acceptance checks

- Actual Bangla fixture screenshot is generated with expected dimensions and nonblank content.
- Long text flags overflow; missing font fails explicitly.
- Rendered markup escapes injected HTML; external unexpected network requests are blocked.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/scene-rendering.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
