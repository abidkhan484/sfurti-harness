# 28. Finish reproducible Pi configuration and executable operator runbook

Status: ready-for-agent
Implementation: not started
Depends on: [05](05-arm64-toolchain.md), [22](22-posting-window-setup.md), [24](24-setup-command-workflow.md), [25](25-pi-service-coordination.md), [26](26-backup-restore.md), [27](27-offline-end-to-end.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S4, S9–S10, and the relevant [contracts](../contracts.md). Existing repository pointers: Dockerfile; docker-compose.yml; .dockerignore; docs/research/docker-compose.md; operator-first-test.md. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Finish opt-in Pi Compose profile/override with exact source/windows/secret/auth mounts, existing data/backup volumes, unprivileged ownership, tool paths and private SearXNG. Keep default invocation doctor; no automatic public activation.
2. Ship a non-destructive init/config validator and templates for permission manifest, windows and credential file references. Provisioning records pins and missing human steps; never overwrites local settings or requests tokens in chat.
3. Implement setup-benchmark 3/1/1 preview with isolated state/report, per-stage time/memory/output bytes/quota records and storage projection. Keep routine production paused during benchmark to avoid resource contention.
4. Update docs/setup-pi.md and this package's operator-first-test.md with commands actually verified against CLI/help. Clearly label existing/pre-implementation versus newly available commands and expected artifacts/deferrals. Include boot/restart, stop and restore procedures.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A29.

Suggested focused tests: test/pi-packaging.test.ts and CLI help/Compose validation.

Validate merged Compose without exposing interpolated secrets, use docs examples in CLI tests, and record ARM64 build status separately. No hardware or public test is claimed from cross-platform mocks.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed local packaging/runbook implementation. Compose remains ARM64/private, unprivileged, and defaults to doctor with exact windows/tool/inbox/auth/secret mounts. `setup-init` creates only missing local inbox/windows scaffolding and reports the remaining human credential/login/evidence steps; shipped Pi config and permission templates contain references/placeholders only. The isolated 3/1/1 preview benchmark binds three video slots to distinct cleared sources, pauses ordinary work with an expiring marker, and records per-item timing/RSS/output/quota plus storage projection.
- Changed files: docker-compose.pi-free.yml; config/harness.pi-free.example.json; config/permission-manifest.example.json; src/app.ts; src/cli.ts; src/coordinator.ts; docs/setup-pi.md; operator-first-test.md; test/pi-packaging.test.ts; test/pi-benchmark.test.ts
- Tests and actual results: `node src/cli.ts help` confirmed `setup-init`, benchmark, and selected-publication command help; `node --test test/pi-packaging.test.ts test/pi-benchmark.test.ts` passed (2/2); `npm run typecheck` passed; `git diff --check` passed.
- Native ARM64 or external verification: not performed
- Remaining blockers/limitations: no ARM64 build, real Pi, operator media, account probe, or benchmark was performed. The runbook labels these as operator-only evidence and does not claim them from fixtures.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-15: Completed local setup scaffolding and documentation without reading/writing credentials, running Docker, or changing an existing local configuration file.
