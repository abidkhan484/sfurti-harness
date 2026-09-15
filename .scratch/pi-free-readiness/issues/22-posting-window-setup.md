# 22. Save evidence-backed windows and validate daily capacity

Status: ready-for-agent
Implementation: not started
Depends on: [01](01-pi-profile-contracts.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S8, and the relevant [contracts](../contracts.md). Existing repository pointers: src/config.ts; src/planning.ts windows/slots; src/maintenance.ts; docs/setup.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Use one shared windows parser for doctor/planning: correct timezone, same-day HH:MM start/end, nonempty evidence with date/limitations and finite positive spacing.
2. Research provisional Bangladesh-audience windows using accessible sources and/or operator-provided Page observations; record context and limitations. Use 60-minute spacing as policy, not an optimal-engagement claim.
3. Provide a generated example and a safe local setup action that creates a missing file without overwriting existing windows. Mount exact configured path in later Compose ticket.
4. Validate five available daily slots including existing posts, insufficient/overlapping windows and late-day scheduling. Do not fabricate evidence simply to turn ready true.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A24.

Suggested focused tests: test/pi-posting-windows.test.ts.

Test wrong timezone, invalid times/date/evidence, five-slot capacity and spacing against remote-confirmed posts. Keep generic existing scheduling behavior compatible.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: partial fixture implementation. One shared strict Pi windows parser validates timezone, research evidence/date/limitations, same-day non-overlap, and positive spacing; planner preserves old inline legacy compatibility. `setup-posting-windows` creates only a missing template.
- Changed files: src/deployment/posting-windows.ts; src/planning.ts; src/maintenance.ts; src/app.ts; test/pi-posting-windows.test.ts
- Tests and actual results: focused parser test passed as part of the 3/3 command recorded in ticket 21; `npm run typecheck` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: no Bangladesh audience research or Page observation was performed; five-slot capacity integration and operator evidence remain to be completed.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.
