# Senior QA Full-Journey Test Plan: Sfurti Content Harness

> **For QA & Agentic Verification:** Comprehensive end-to-end journey verification for the Sfurti Content Harness running on Raspberry Pi 5 (ARM64 Ubuntu 25.10).

**Goal:** Exhaustively verify the full lifecycle of content discovery, folder intake, source qualification, multi-modal production (video reel, image, text), independent media inspection & editorial review, quota deferral, long-range 90-day planning, posting windows, publication safety gates, outbox delivery, backup/restore, and real ARM64 Pi benchmark performance.

**Architecture:** Node/TypeScript harness with built-in SQLite, Chromium HTML/CSS rendering for Bangla typography, FFmpeg/libass for clip rendering, Whisper/Piper for ASR/TTS, and replaceable external adapters guarded by strict isolation barriers (Preview mode vs Live publication).

**Tech Stack:** Node 24+, SQLite, TypeScript, FFmpeg/ffprobe, Chromium, Noto Sans Bengali, Whisper.cpp, Docker Compose.

## Global Constraints
- Target Hardware: Raspberry Pi 5, 8 GB RAM, 64 GB microSD (Linux aarch64).
- Deployment Profile: `pi-free` (preview execution mode, ChatGPT-only Codex billing, zero paid API keys).
- Language & Mission: Bangla-first (`bn`), child agency & meaningful effort for ages 3–15.
- Daily Content Target: 3 videos (distinct sources), 1 image, 1 text per Bangladesh day (`Asia/Dhaka`).
- Long-range Target: 90 days planning coverage in content reserve library.
- Security Hard Stop: Never read or leak `meta_access_token_file` or ambient API keys. Never perform unauthorized external Facebook writes.

---

### Phase 1: Configuration, Pre-Flight & Diagnostics Audit
- [ ] Fix stale `llm.provider` in `config/harness.json` to valid `taskModels` format.
- [ ] Run `sfurti config validate` on valid configurations.
- [ ] Test negative config validation: corrupt JSON, missing taskModels, paid API key injection on pi-free profile, invalid timezone, negative daily counts.
- [ ] Run `sfurti doctor` and verify truthful diagnostic reporting of missing posting windows, unverified sample, and missing adapters.
- [ ] Run `sfurti storage` and verify free bytes calculation and media directory walking.

### Phase 2: Setup Scaffolding & ARM64 Native Toolchain Audit
- [ ] Run `sfurti command --json '{"type":"setup-init"}'` and verify directory scaffolding (`data/inbox`, `config/posting-windows.json` template).
- [ ] Verify ARM64 toolchain manifest: validate `ffmpeg`, `ffprobe`, `chromium`, `noto-sans-bengali`, `whisper-cli`.
- [ ] Run `sfurti command --json '{"type":"setup-probe", ...}'` against search, codex, and facebook targets.

### Phase 3: Content Discovery & Folder Intake Journey
- [ ] Test `discover` command: verify Bangla keywords, source metadata attribution, and ensure discovery does not confer reuse permission.
- [ ] Test valid source intake (`intake-scan`): create READY-marked folder with valid `permission.json` and synthetic Bangla video. Verify idempotent intake.
- [ ] Test adversarial/negative intake cases:
  - Missing `READY` marker (must be ignored or held).
  - Malformed permission JSON or schema violations.
  - Path traversal attempts (`../../etc/passwd`).
  - Missing required permission scopes (e.g. omitting `edit` or `facebook`).
  - File size exceeding `maxVideoMinutes` or storage budget.

### Phase 4: Source Qualification & Tamper Detection Journey
- [ ] Test `qualify-source`: inspect raw video, generate frames, audio transcript, and candidate segment intervals.
- [ ] Verify cryptographic hash binding: source file SHA-256 bound to qualification record.
- [ ] Adversarial tamper test: modify source video bytes after qualification, verify downstream production detects integrity violation and aborts.

### Phase 5: Multi-Modal Production & Independent Review Journey
- [ ] Test Bangla text rendering: verify conjunct preservation (`ক্ষ`, `জ্ঞ`, `ত্র`, `শ্র`), Noto Sans Bengali font, and HTML metacharacter escaping.
- [ ] Test Bangla image rendering: verify vertical card layout, font size, contrast, and layout stability.
- [ ] Test video clip rendering: verify FFmpeg 9:16 vertical crop, 30–60s duration, audio sync, and subtitle burning.
- [ ] Test Independent Media Inspection: verify corrupt frame detection, audio intelligibility/coverage check, and silent video rejection.
- [ ] Test Independent Editorial Review: verify adherence to Sfurti mission, age appropriateness (3–15), and 3-attempt iteration limit with feedback history.

### Phase 6: Quota Deferral & Task Resumption Journey
- [ ] Test Codex quota exhaustion handling: ensure clean pause without corrupt artifacts or partial database records.
- [ ] Test task resumption: verify resumed task continues from saved stage with identical model and role.

### Phase 7: Setup Sample, Delivery & Attestation Journey
- [ ] Execute `setup-sample` using qualified source: verify generation of exactly one approved custom artifact without scheduling.
- [ ] Check `setup-sample-status`: verify lifecycle stage tracking.
- [ ] Test `setup-send`: test Telegram outbox delivery, idempotency key deduplication, and error holding.
- [ ] Execute `setup-attest`: verify cryptographic attestation receipt and update of doctor readiness.

### Phase 8: 90-Day Planning, Spacing & Queue Export Journey
- [ ] Test `plan --days 90`: verify calendar day allocation in `Asia/Dhaka` timezone.
- [ ] Verify posting windows compliance: minimum spacing (`minSpacingMinutes`), non-overlapping windows, time randomization.
- [ ] Verify source diversity enforcement: no duplicate source videos on the same calendar day.
- [ ] Test `export-queue`: verify CSV output with UTF-8 Bangla preservation, atomic writes, and recovery from deleted/corrupted CSV.

### Phase 9: Publication Safety Barrier & Remote Reconciliation Journey
- [ ] Verify Pi preview mode safety guard: assert that `publish`, `cancel`, `publish-one`, and `activate-publication` reject external mutations in preview mode.
- [ ] Test Fenced Coordinator Leasing: verify that two concurrent processes cannot double-submit or overwrite state.
- [ ] Test Replay Protection: verify that identical command IDs return cached results and conflicting fingerprints are rejected.
- [ ] Test Remote Reconciliation: simulate timeout/network failure during publication and verify that post status remains uncertain until reconciled.

### Phase 10: Service Daemon, Disaster Recovery & Benchmark Journey
- [ ] Test `service-cycle` / background tick: verify graceful handling, recovery of missed minutes, and clean SIGINT/SIGTERM shutdown.
- [ ] Test `backup`: create SQLite snapshot + media files + manifest.
- [ ] Test `restore-verify`: verify database checksums and schema integrity in an isolated directory.
- [ ] Run `setup-benchmark`: execute 3-video + 1-image + 1-text benchmark, measuring elapsed time, memory RSS, disk growth, and temperature on the Pi 5.
