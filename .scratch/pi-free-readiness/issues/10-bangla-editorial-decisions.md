# 10. Generate bounded Bangla editorial decisions through Codex

Status: ready-for-agent
Implementation: not started
Depends on: [04](04-durable-quota-tasks.md), [09](09-source-qualification.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S6, and the relevant [contracts](../contracts.md). Existing repository pointers: src/adapters/llm.ts; src/adapters/codex.ts; src/production.ts editor.create; docs/mission.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Add generation schemas for text/image copy and clip edit decisions: Bangla body, caption, source attribution, age scope, overlays, timed subtitles and immutable original interval mapping.
2. For video, use only qualified permitted source content and retain qualifications/context. For standalone text/images use mission/activity invitations; unsupported factual/developmental claims are held, not relabeled as evidence.
3. Persist decisions by artifact version/input hash/idempotency key before rendering. A quota retry resumes its generation task; completed decisions are reused. Include prior corrective findings only for the generator.
4. Keep source strings as data, escape template/control syntax downstream, bound all text/timing lengths and fail invalid structured output. Provide a stable internal interface for tickets 11–13.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A04, A05, A13, A14.

Suggested focused tests: test/pi-editorial.test.ts.

Test invalid Bangla/timing/schema, invented attribution, quote/context loss fixtures, safe long text and decision reuse. Reviewer context must never receive generation conversation or self-approval.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level bounded Bangla editorial-decision contract. Structured decisions validate Bangla copy, attribution, overlays and subtitle timings; decision input hashes provide durable reuse, and videos require a qualified source attribution.
- Changed files: src/adapters/local/editorial.ts; test/pi-editorial.test.ts
- Tests and actual results: `node --test test/pi-editorial.test.ts` passed; `npm run typecheck` passed; `npm run lint` passed with 125 warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: the stable adapter is intentionally not wired to rendering until tickets 11–15; actual ChatGPT-authenticated Codex generation and quota recovery require operator/Pi verification. No source text is granted execution capability or review-history access.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: Fixture-only decision schema and cache implementation; no Codex account was invoked and no content was rendered or published.
