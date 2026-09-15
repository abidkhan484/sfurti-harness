# 09. Inspect imported sources and qualify exact candidate intervals

Status: ready-for-agent
Implementation: not started
Depends on: [04](04-durable-quota-tasks.md), [05](05-arm64-toolchain.md), [07](07-folder-intake.md), [08](08-discovery-recommendations.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S5–S6, and the relevant [contracts](../contracts.md). Existing repository pointers: src/coordinator.ts eligible source selection; src/production.ts intervals and discovery qualification; src/domain.ts; src/research/agents.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Create a source-inspection pipeline reading actual imported source hash, timed independent ASR and timestamped frames. Use bounded/chunked processing for long sources; retain evidence and uncertainty, never mark unseen content reviewed.
2. Run isolated topic-validation/qualification through TaskModelRouter. Validate relevance, credibility, local relevance, source topic, context and evidence. Authority/permission alone cannot establish factual truth.
3. Save qualification metadata in the existing coordinator-compatible shape, bound to source/mission hash. Support multiple candidate interval sets; select one unused valid 30–60-second set per clip rather than concatenating all candidates.
4. Integrate current daily source diversity and reservation rules. A source modified after qualification becomes ineligible. Insufficient content/evidence holds the candidate and permits independent text/image work.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A10, A11, A12.

Suggested focused tests: test/pi-source-qualification.test.ts.

Test in-bounds and fabricated/out-of-range intervals, transcript gaps, changed file, reused segments, multiple candidates and three-distinct-source daily selection. Independent source evidence must be saved before qualification passes.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level source qualification. It requires registered-file integrity, timed source inspection evidence and an isolated qualifier; only in-bounds 30–60 second candidate sets are persisted, hash- and mission-bound, with qualification metadata compatible with the coordinator.
- Changed files: src/production.ts; src/app.ts; test/pi-source-qualification.test.ts
- Tests and actual results: `node --test test/pi-source-qualification.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 124 warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: the source inspector and isolated Codex qualification route are injected seams until tickets 14–15 wire real native evidence/adapter paths. Pi FFprobe/ASR/frame quality, three distinct operator sources and actual Pi capacity remain ticket 29 verification.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only completion with no account, network, source download, or external notification. Changed retained source bytes fail integrity before any repeat qualification.
