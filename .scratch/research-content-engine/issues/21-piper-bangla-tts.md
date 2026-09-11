# 21 — Integrate local Piper bn_BD narration

Status: ready-for-agent
Implementation: not started
Dependencies: [03](03-research-configuration.md), [19](19-bangla-content-generation.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S7, C5
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Configured Piper produces verified nonempty audio; live voice quality remains an explicit sample check.

## Files and boundaries

- src/adapters/tts/piper.ts
- src/content/spoken-text.ts
- test/piper-tts.test.ts
- docs/integrations/piper.md

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement Tts.synthesize via configured Piper executable/model/config and shell:false argument arrays. Pin voice hashes and retain model-card/attribution setup record.
2. Normalize Bangla numbers/abbreviations conservatively; retain original script and normalized spoken text for reviewer comparison.
3. Probe generated WAV duration/sample rate and reject empty/silent/truncated outputs. Cache by spoken text+voice+config hashes.
4. Document bn_BD voice download/setup without automatically substituting another locale or unverified voice. Runtime/voice rights are evaluated separately.

## Acceptance checks

- Stub executable contract verifies Unicode stdin, safe paths and argument handling.
- Changed voice hash invalidates cache; empty/silent WAV fails.
- One opt-in actual Piper sample yields measurable Bangla narration and records exact model/version.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/piper-tts.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
