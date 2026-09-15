# 15. Wire real adapters into independent approval and production

Status: ready-for-agent
Implementation: completed fixture-level
Depends on: [10](10-bangla-editorial-decisions.md), [11](11-text-image-renderer.md), [12](12-licensed-clip-renderer.md), [14](14-independent-output-inspection.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S3, S6, and the relevant [contracts](../contracts.md). Existing repository pointers: src/adapters/index.ts; src/production.ts; src/coordinator.ts; src/domain.ts; test/production.test.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Wire typed local editor/media/discovery implementations into createConfiguredAdapters with workflow/store dependencies supplied explicitly. Preserve executable adapters and CodexReviewer fallback behavior.
2. Bind reviews to artifact version/hash, mission, observed media evidence and source qualifications/permissions. Generator session and identity are never the reviewer session. Missing evidence fails appropriate criteria.
3. Preserve three render versions, corrective feedback and source interval consumption only on approval. Ensure quota deferral is distinct from corrective failure and resumed work does not create another version.
4. Cover all three content kinds, persist approval lineage and retain publication revalidation. A source-only test fixture cannot mark a finished artifact approved.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A04, A05, A10, A15.

Suggested focused tests: test/pi-production-integration.test.ts.

Run synthetic create→inspect→review for each kind, a rejected/corrected version and altered approved file. Check legacy external-adapter tests still pass.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level production integrity wiring. Video production now rechecks retained source bytes before reserving an interval; existing three-version feedback/independent-review and quota behavior remain covered by the full suite.
- Changed files: src/production.ts; test/pi-production-integration.test.ts
- Tests and actual results: `node --test test/pi-production-integration.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 127 warnings and no errors; `git diff --check` passed; `npm test` passed (104/104).
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: ticket-local adapters are fixture-tested; native renderer/inspector and ChatGPT-authenticated reviewer wiring remain subject to Pi/operator verification. No source-only fixture is accepted as approval evidence.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Full local regression passed. No account, source download, delivery or publication operation occurred.
