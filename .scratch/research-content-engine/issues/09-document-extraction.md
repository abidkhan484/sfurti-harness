# 09 — Extract HTML, PDF and feeds with stable provenance

Status: ready-for-agent
Implementation: not started
Dependencies: [01](01-research-contracts.md), [08](08-http-collection.md)
Execution gate: dependencies must be implemented and their acceptance checks passing.
Spec references: S6, C1–C2
Estimated scope: one bounded implementation ticket; split further if a provider-specific contract cannot be verified.

## Read first

Read repository AGENTS.md and CONTEXT.md, [spec](../spec.md), and only the relevant sections of [contracts](../contracts.md) named above. Read [acceptance scenarios](../acceptance.md) for integration context. Current code is the baseline; proposed file paths below may not exist yet.

## Goal

Validators receive inspectable normalized documents with truthful access/coverage status.

## Files and boundaries

- src/research/extraction.ts
- src/adapters/collection/extract.ts
- test/research-extraction.test.ts

These are the intended edit surfaces. Inspect their existing callers/tests before editing. If integration requires an additional file, explain it in the completion record. Preserve unrelated work and legacy behavior; do not refactor the whole repository.

## Implementation steps

1. Implement HTML article extraction with a maintained parser, plain-text handling, PDF text/page extraction and RSS/Atom entry parsing. Feed entries can enqueue article fetches rather than masquerade as full text.
2. Normalize text deterministically and preserve UTF-16 start/end locators, PDF pages and metadata; detect language without requiring Bangla.
3. Remove boilerplate/scripts and redact audience identifiers before persistent memory. Mark scanned/unreadable PDF and truncated content partial; do not hallucinate OCR.
4. Record chosen parser versions and extraction coverage. Keep file/hash metadata sufficient to repeat exact locator checks.

## Acceptance checks

- Fixtures in Bangla, English and one other language retain excerpts and offsets.
- PDF page locator resolves; unreadable/scanned fixture becomes partial.
- Private handles/emails removed from audience text; scientific author attribution remains.
- Equivalent normalized content reuses blob without losing distinct source URLs.

## Verification

Run from /infinity/codes/own/sfurti-harness.

    node --test test/research-extraction.test.ts

    npm run typecheck
    npm run lint
    git diff --check

Use injected transports and temporary directories in ordinary tests. Real-provider samples are opt-in and reported separately. Run the full npm test suite after changes to shared app/store/config/planning/production contracts. No mocked check establishes live readiness.

## Completion record

Append exact changed files, tests run/results, any unverified external prerequisites, and any deviation from the spec under Comments. A ticket is not implemented merely because interfaces or mocks exist: its concrete behavior above must work. Keep Status within the repository's canonical triage vocabulary; record implementation completion here rather than inventing a new triage status.

## Comments

- Created 2026-09-09. No implementation performed as part of specification authoring.
- Implemented 2026-09-10: added conservative HTML/PDF/feed extraction and stable UTF-16 locators in `src/research/extraction.ts` and `src/adapters/collection/extract.ts`, plus synthetic Bangla/English/Spanish, malicious-page, feed, readable-PDF, and scanned-PDF fixtures with `test/research-extraction.test.ts`.
- Checks: focused extraction test, `npm run typecheck`, lint with no errors, and `git diff --check` passed.
- Deviation: no maintained HTML/PDF parser dependency was added. The built-in implementation marks unsupported/scanned PDFs and incomplete feeds partial rather than inventing full-text access. External prerequisite: none for offline fixture behavior.
