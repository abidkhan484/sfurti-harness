# 05. Package and pin the ARM64 media/search toolchain

Status: ready-for-agent
Implementation: not started
Depends on: [01](01-pi-profile-contracts.md), [02](02-secret-and-tool-boundaries.md)

## Read first

Read [work protocol](../README.md), [spec](../spec.md) sections S3–S4, and the relevant [contracts](../contracts.md). Existing repository pointers: Dockerfile; docker-compose.yml; .dockerignore; package-lock.json; docs/research/docker-compose.md; src/adapters/search/searxng.ts. These paths are relative to the repository unless they name this package. Proposed modules/tests may not exist yet; inspect immediate callers before editing.

## Deliverable and steps

1. Add an opt-in Pi Docker build/Compose override without replacing existing named volumes. Package native Node/Codex runtime, FFmpeg/ffprobe, Chromium/Noto Sans Bengali, whisper.cpp and a private SearXNG service. Keep optional Piper assets separable.
2. Resolve exact upstream versions, ARM64 image digests/build sources, font/license metadata and model hashes from canonical sources. Create a reproducible tool manifest. Do not invent digest values or rely on moving latest tags.
3. Choose multilingual whisper small as the initial benchmark candidate, never small.en. Stage downloads explicitly during provisioning, bounded by the space guard; runtime startup does not download. Verify actual binary architecture and required codec/filter capabilities.
4. Keep render/ASR processes under one heavy-task budget and two native threads initially. Bind search privately; enable JSON and health checks. Build steps/tests on x86 do not count as native Pi validation.

## Acceptance and tests

Cover [acceptance scenarios](../acceptance.md): A14, A29.

Suggested focused tests: test/pi-tool-manifest.test.ts.

Validate incomplete/wrong-architecture/hash-mismatch manifests fail. Record container build and native smoke evidence separately; leave hardware verification to ticket 29 if no ARM64 machine is available.

For code changes run the focused tests and `npm run typecheck`; run `npm run lint` and `git diff --check`. Run the full suite when shared contracts or orchestration change, and at ticket 27. Preserve current dependency versions and real hooks; no `--no-verify`. Native/account checks not executed must remain explicitly unverified.

## Boundary

Implement only this ticket after dependencies have completion evidence. Keep unrelated working-tree changes and the research-engine tracker intact. This ticket does not authorize a commit, push, public post, credential sharing or broad cleanup. Follow the explicit operator boundary for any live action; fixture implementation does not require account credentials.

## Completion record

- Implementation result: completed fixture-level manifest/Compose work. Added an ARM64-only Pi Compose overlay with private SearXNG and preserved volumes, plus a strict manifest requiring multilingual Whisper small rather than small.en.
- Changed files: src/deployment/tool-manifest.ts; config/pi-tool-manifest.example.json; docker-compose.pi-free.yml; test/pi-tool-manifest.test.ts
- Tests and actual results: `node --test test/pi-tool-manifest.test.ts` passed (1/1); `npm run typecheck` passed; `npm run lint` passed with 117 pre-existing warnings and no errors; `git diff --check` passed.
- Native ARM64 or external verification: not performed.
- Remaining blockers/limitations: Docker build, tool binaries/codecs, model download/hash verification, and Pi architecture smoke must be performed by ticket 29. Runtime startup does not download any model.

## Comments

Created from the agreed Pi/free-service deployment requirements; not executed during specification.

2026-09-14: SearXNG ARM64 digest and Whisper model pin were recorded from upstream package/model metadata; no image/model download or Pi build was run.
