# 11. Render actual Bangla text files and mission images

Status: ready-for-agent
Implementation: not started
Depends on: [05](05-arm64-toolchain.md), [06](06-bounded-storage.md), [10](10-bangla-editorial-decisions.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S6, and the relevant [contracts](../contracts.md). Existing repository pointers: src/adapters/index.ts; src/production.ts editor.create; proposed src/adapters/local/editor.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Implement local editor branches for UTF-8 text and 1080×1080 PNG. Use deterministic escaped HTML/CSS with the pinned Bangla font and Chromium; no external assets/network/resources or paid generation.
2. Provide bounded templates for headline/body/attribution, safe margins, line wrapping and overflow rejection. Use a simple text Sfurti wordmark until the operator supplies owned brand assets; do not require a logo to bootstrap.
3. Return the existing filePath/caption contract. Persist content/tool/font/input/output hashes and atomic manifest per version. Replaying a completed key returns the same output, not a re-render.
4. Handle corrupt template/browser crash/timeout as actionable failure; remove only owned incomplete scratch. Native output belongs under retained media roots.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A13, A14.

Suggested focused tests: test/pi-text-image.test.ts.

Use Bangla conjuncts, long lines, quotes/HTML injection and missing-font fixtures. Add native visual smoke evidence; PNG existence alone is not a layout pass.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level local text/image renderer. Text output is UTF-8; image rendering uses an escaped, asset-free 1080-square local Chromium template with a font path, atomic output and hash-bearing sidecar manifest.
- Changed files: src/adapters/local/editor.ts; test/pi-text-image.test.ts
- Tests and actual results: `node --test test/pi-text-image.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 125 warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: no native Chromium/font visual smoke ran here; ticket 29 must validate actual Bangla conjunct layout, overflow and ARM64 Chromium output. Renderer adapter wiring into production remains ticket 15.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture text output only; no external asset, browser network use, image-generation provider, or deletion outside owned renderer scratch was performed.
