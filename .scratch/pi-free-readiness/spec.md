# Raspberry Pi deployment and first verified execution

Status: ready-for-agent
Implementation: not started
Created: 2026-09-14
Baseline inspected: e8fa401

## S1. Outcome and agreed constraints

Make the existing licensed-clip workflow operational on a Raspberry Pi 5 with 8 GB RAM and a 64 GB microSD, running continuously. Use a local folder for operator-supplied, permission-backed videos. Discovery recommends candidates; it does not acquire permission or download video footage. Keep 3 videos, 1 image and 1 text per Bangladesh calendar day, the current topic/audience, and the 90-day approved-content reserve target. Custom samples remain additional to daily work.

The only paid entitlement is the operator's existing ChatGPT Plus subscription. Use Codex SDK with ChatGPT authentication. No Platform API key, automatic paid fallback, paid search, paid hosting, stock purchase, or image/video generation service is part of this deployment. Subscription capacity, network availability, render speed and actual disk capacity are measured constraints, not delivery guarantees.

This package authorizes a design and implementation backlog, not implementation during its creation. No live Facebook post or Telegram message is authorized by writing these documents. Existing accounts are available, but credentials and Page capability have not been verified here. See [operator steps](operator-first-test.md).

## S2. Scope and current gaps

The current source contains a Codex strategy, independent reviewer, generic process wrappers, source registration with retained permission evidence, planning, notification outbox and Facebook orchestration. It does not contain working concrete legacy editor/media/discovery/Facebook/Telegram transports. Merely setting executable names does not provide them.

Specific gaps verified in source:

- `maintenance.ts` checks adapter objects, windows and an approved sample; it makes no live checks and does not validate Codex authentication.
- `adapters/codex.ts` copies auth into a temporary home, starts fresh sessions, and removes the home. Refresh persistence and ADR-0003 task resumption need implementation.
- `production.ts` registers permitted files but automatic video selection in `coordinator.ts` also requires `metadata.qualified`, topic matching, evidence and segments. An importer alone cannot feed production.
- `domain.ts` currently hashes entire files in memory. Registration copies sources into the media library. Large inputs therefore require bounded hashing and peak-space admission.
- `service.ts` invokes publication every cycle. `notify` can drain Telegram immediately. A preview test needs enforced external-write boundaries, not just omission of `--schedule`.
- The Docker image contains the Node harness only. Auth, posting windows, source inbox, media tools and model assets are not packaged/mounted.
- `ProcessAdapter` passes only PATH/LANG and explicit environment entries. Host `.env` does not automatically reach each wrapper.

Preserve `productionMode: "legacy"`, `research.enabled: false`, `memory.enabled: false`. Cognee and the full evidence-led original-explainer pipeline are not prerequisites for this deployment. This does not cancel `.scratch/research-content-engine/` or change its statuses. Reuse completed modules, not assumptions from tracker completion text.

### Existing design relationships

- ADR-0001: keep Codex behind `TaskModelRouter`/strategy; orchestration owns workflow state.
- ADR-0002: retain separate production, local plans and remote publication. A 90-day target is not a promise of remote scheduling or available storage.
- ADR-0003: implement persisted role-specific sessions and quota deferral. Resuming a task must not share generation history with review. Never invent remaining subscription allowance.
- ADR-0004/0005: retain the separate research/evidence design; legacy clips do not become scientifically verified because a creator is credible or grants reuse rights.
- Unrelated `docs/superpowers/` work is outside this package. Its historical dependency versions and refactoring instructions do not override current package.json or these requirements.

## S3. Concrete architecture

Use typed built-in Node adapters for this deployment, wired through existing adapter interfaces. Preserve the existing process-wrapper configuration for other deployments. A built-in discriminant such as `kind: "local"`, `kind: "searxng"`, or `kind: "graph"` selects a real implementation; legacy objects with `executable` retain their behavior. Do not replace a missing adapter with a successful no-op.

New production modules belong under `src/deployment/`, `src/intake/` and `src/adapters/local/`, with Facebook and Telegram modules under `src/adapters/`. External native tools run through an argument-array subprocess runner with cancellation and bounded output. The renderer has no Page or Telegram credentials. LLM tasks receive source data as untrusted quoted inputs and have no shell/browser/publication tools.

Proposed tool selection, to be pinned and ARM64-tested by ticket 05:

| Task                    | Selection                                                                | Verification required                                    |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| General/video discovery | Private SearXNG service; reuse `SearxngSearch`                           | JSON enabled, bounded search, useful real results        |
| Text and image layout   | Escaped HTML/CSS rendered by distro Chromium with Noto Sans Bengali      | Actual Bangla conjuncts, clipping, font provenance       |
| Clip composition        | FFmpeg/ffprobe, software H.264/AAC, libass captions                      | ARM64 codecs/filters, real render and audio              |
| Transcription           | whisper.cpp, multilingual `small` model as initial candidate             | Hash/pin, Bangla accuracy and Pi runtime; no `.en` model |
| Optional dubbing        | Piper `bn_BD-google-medium`; speaker 0 initial candidate                 | ARM64 runtime, voice rights and listener test            |
| Review                  | Codex text + actual rendered frames + independent ASR/audio measurements | Fresh reviewer context and honest coverage               |

These are engineering choices, not claims that every binary/model is installed or sufficiently accurate. Memory from a prior workstation setup mentions a Piper speaker-0 audition; it is not Pi verification or public-narration approval. Original Bangla source audio is the first-test path. Foreign-source dubbing stays unavailable until ticket 13 and its quality checks pass. Do not silently substitute a different voice or paid provider.

## S4. Runtime profile and private configuration

Add a versioned opt-in profile `deployment.profile: "pi-free"`. Do not rewrite an existing local configuration during installation. Profile values:

- `executionMode: "preview"` initially; `live` requires a separately recorded activation command.
- `llm.billingMode: "chatgpt-only"`; all required routes have explicit accessible Codex model IDs. Reuse the operator's selected model only after access/capability checks. API-key auth is rejected for this profile.
- `daily` remains 3/1/1. `reserve.minimumDays` remains 90. Keep planning coverage truthful when budget or source supply prevents filling it.
- One CPU-heavy task across rendering, ASR and dubbing; one active Codex task. Initial native-tool thread cap 2. HTTP requests must have deadlines; no external operation holds a SQLite transaction.
- Stage deadlines: Codex 5 minutes, render 30 minutes, ASR 60 minutes initially. Each has durable checkpoints and cancellation; benchmark adjusts explicit settings, not model/quality requirements. Renew/fence leases while long stages run.
- Admission guard: retain at least 8 GiB filesystem free after estimated peak operation usage. Managed-data ceiling initially 32 GiB; include source copies, renders, evidence, sessions, search/model caches and logs in reporting. These are conservative policy defaults, not measurements of this Pi.
- Input cap: 2 GiB/video and 60 minutes/video initially. Explain rejection and allow a later deliberate config increase after capacity assessment. The first test uses a much smaller file.
- Discovery: at most 3 queries × 10 results per daily batch, at most 5 distinct recommendations per topic/day; one search HTTP request at a time, at least one second between requests. Cache and back off on outages/challenges.
- Inbox scan every 60 seconds; persist fingerprints so unchanged files are not rehashed each scan. Discovery and intake run before video allocation and are independently retryable.

Keep secrets in private mounted files, not prompts, command arguments, tracked config, status/config dumps, logs or SQLite. Proposed names: `SFURTI_FACEBOOK_PAGE_TOKEN_FILE`, `SFURTI_TELEGRAM_BOT_TOKEN_FILE`; config stores only file references. Keep Page ID/operator ID non-secret. A dedicated writable Codex auth directory persists refreshes. Per-task homes remain isolated; auth merge is serialized and atomic, and no unrelated host Codex config is imported.

Proposed host/container paths, configurable without code edits:

| Host                             | Container                          | Mode                  |
| -------------------------------- | ---------------------------------- | --------------------- |
| `./config/harness.json`          | `/app/config/harness.json`         | read-only             |
| `./config/posting-windows.json`  | `/app/config/posting-windows.json` | read-only             |
| `./data/inbox`                   | `/app/inbox`                       | read-only             |
| Existing `sfurti-data` volume    | `/app/data`                        | read-write, preserved |
| Existing `sfurti-backups` volume | `/app/backups`                     | read-write, preserved |
| `./data/private/codex`           | `/run/sfurti/codex`                | restricted read-write |
| `./data/private/secrets`         | `/run/secrets/sfurti`              | restricted read-only  |

Use 64-bit OS/ARM64 containers, unprivileged runtime, bounded rotated logs and no automatic downloads/updates at service startup. Tool/model fetching is an explicit installation step. Enforce request-count/storage budgets on SearXNG. No host Docker socket or public search endpoint. Existing named volumes must not be deleted/replaced to install this profile.

## S5. Discovery, permission and qualification

Sequence: discover → recommend → await operator permission/upload → import → inspect source → qualify and propose exact segments → produce → independent review → local plan → authorized publication.

Discovery can rank metadata and available attributable text. It records provenance, observed language, rationale and uncertainty. Timestamp suggestions without actual content evidence are tentative; they cannot satisfy `actualContentReviewed`. No media download, permission inference, or fabricated timestamps. Candidates lacking usable evidence remain pending. When source supply is insufficient, report the deficit and continue eligible image/text work without changing quotas.

The operator places each source in `data/inbox/<submission-id>/` with `video.mp4`, `permission.json`, permission evidence and `READY`. `READY` is created last, after copying finishes. Require stable stat checks plus streaming hashes before/after retention; reject changing files. A file watcher event alone is insufficient.

`permission.json` contract is defined in [contracts](contracts.md#source-submission). It links recommendation/source ID, original URL, language, relative video/evidence files, explicit scope, restrictions and optional expiry. Current permission policy requires `edit` and `facebook`, and `translate` for foreign-language content. Nonempty restrictions currently require resolution; preserve the real restrictions and hold intake rather than deleting them to pass a check.

Reject absolute paths, `..`, symlinks, devices, paths outside the selected inbox item, missing evidence, duplicate IDs with changed content and unsupported/corrupt media. Preserve operator originals. Preflight peak duplicate storage before registration. Record received/imported/held/qualified states, hashes and reasons durably; exactly repeated scans must not duplicate source/permission records or notifications.

Post-import qualification examines actual source audio/transcript and timestamped frames, then independently assesses relevance, credibility, local relevance and contextual fidelity. It binds evidence to source hash and mission version, records topic(s), and selects 30–60-second non-overlapping source intervals. Permission and content quality are distinct gates. Existing daily source diversity remains: three daily clips need three eligible distinct sources. A single source is enough for one custom sample, not a daily-volume proof.

## S6. Content creation and review

Generation routes through Codex and returns schema-validated Bangla copy, caption, attribution and edit decisions. Output must preserve context, qualifications, child age scope and the mission. No diagnosis, invented scientific claims or unverified statistics. For source-independent text/images, start with concrete activity invitations and mission statements; factual claims need attributable evidence or must be deferred. No routine human editorial gate is added.

Text output: UTF-8 `.txt`. Image output: 1080×1080 PNG using deterministic local templates. Video output: 1080×1920, 30–60 seconds, H.264/AAC MP4 with original source intervals and original Bangla audio initially. Fit/pad preserves meaningful subjects; crop only with validated edit decisions. No stock music or assets with unknown rights. Captions/overlays must be rendered with tested Bangla fonts. Cap delivery file size deliberately; a smaller Telegram preview is a separately labeled derivative, never substituted for the reviewed publication artifact.

Persist structured editorial decisions and per-stage output manifests by artifact version/idempotency key. An identical retry returns the same completed render. A new corrective version has a new key. Partial output uses temporary files then atomic promotion; cancellation leaves resumable records and owned scratch cleanup only. Evidence/source/model/mission changes invalidate relevant checkpoints.

Inspection reads the retained output, not producer claims: probe media, decode for corruption, extract time-indexed frames at start/end, cuts and at most 2-second intervals; inspect image layouts and independently transcribe actual audio. Report audio levels/silence, transcript coverage, uncertain spans, frame coverage, tool versions and limitations. ASR text alone cannot prove intelligibility; combine actual signal measurements, transcript coherence/alignment and visual/context checks, with a human listen during deployment qualification. If automated evidence cannot support a criterion, hold/reject instead of setting it true. Partial sampling remains explicitly partial, not full audiovisual understanding.

Review uses a separate role/session and current artifact hash; it cannot inherit producer history/self-assessment. Preserve all existing criteria and the maximum three render versions. Quota deferral does not consume a corrective iteration. Approved artifacts retain version-bound evidence and provenance; altered/missing files invalidate eligibility at scheduling and publication.

## S7. External delivery and publication boundaries

`preview` blocks all Facebook mutations at the application and adapter boundaries, including direct `publish`, scheduling, cancellation, service-cycle and Telegram-dispatched commands. It does not claim publication success. Local production/planning can run. Telegram outbound messages require an explicit setup-send or enabled delivery setting; first local sample uses notifications queued locally. Read-only capability checks are explicit commands, not hidden doctor actions.

Telegram built-in transport must implement both `telegram.deliver` and `telegram.poll`, upload actual media and persist message IDs. Poll only the configured private operator; maintain a durable update inbox and acknowledge offset only after durable receipt. Unknown inbound JSON actions still pass through application authorization. Recommendation messages include submission ID, source URL, reason and permission/upload instructions. Do not send private permission evidence. Ambiguous outbound sends are held for resolution; do not claim exactly-once network delivery or retry indefinitely after a lost response.

Facebook requires a pinned documented API version, Page identity, scoped credentials and format-specific capabilities. Ticket 18 records verified endpoint/request/response contracts before tickets 19–21 implement calls. Official Meta pages returned HTTP 429 during spec preparation; no API version, scope list, endpoint behavior or scheduling limit has been asserted current here. This is agent research work, not a reason to request new user requirements.

Persist upload sessions, attempt identity, content hash and remote IDs before advancing. Upload receipt is not published status. Reconcile timeouts/process death before any resubmission. When the platform cannot resolve a lost outcome, keep `unknown/uncertain` and block duplicate sends. Local due-time dispatch may serve formats without supported future scheduling; extend the bounds contract explicitly rather than inventing remote scheduling support. Cancel only confirmed selected targets and keep remote-confirmed schedules across local replanning.

First public smoke is a later, explicit selected-artifact action. A one-post authorization binds Page ID, artifact/version/hash and operation; it never drains other queued posts or enables recurring publication. Continuous live activation is a separate operator command that checks readiness. No automatic activation after reboot, setup verification or changing a config file alone.

## S8. Scheduling, storage and resilience

Save a windows JSON file with `Asia/Dhaka`, `windows[{start,end}]`, evidence references, research date and limitations. Establish provisional windows using accessible evidence and audience context, then revise with Page observations; do not label generic timings optimal. Initial spacing policy is 60 minutes. Validate that five daily slots fit and enforce spacing against existing remote/local posts. Missing evidence keeps the gate unsatisfied.

Preserve a 90-day horizon and target of 270 videos, 90 images and 90 texts. Distinguish target, actual approved/timed coverage and estimated bytes. Illustrative only: 270 × 30 MB = 8.1 GB of finished video; 270 × 100 MB = 27 GB, excluding originals, revisions, models and OS. Retaining one original in both inbox and library can dominate storage. Admission estimates must account for it. Never reduce the quota or claim coverage because a topic placeholder exists.

Protect the Pi with streaming hash/copy, one heavy worker, incremental scans, bounded cache/logs and cleanup only of expired owned temporary files that have no active lease. Original videos, permission evidence, approved media, publication history and review lineage are not automatically deleted. Low space pauses new expensive work and reports the deficit. A 90-day target may remain unmet on this card; record that limitation explicitly rather than changing the accepted requirement.

Backup uses SQLite's online backup or stopped writers plus all referenced files, checksums and schema/config/tool version metadata. Secrets excluded. Restore into an isolated destination and verify references; same-card backup is recovery from application mistakes, not protection against card loss. External backup can use an existing device, but is not a paid hardware prerequisite for the first test.

ADR-0003 quota behavior: persist role/model/session, completed steps and next retry; share account quota blocks; let already-rendered delivery/reconciliation continue; resume the same task session when supported. If a needed session cannot resume, return an explicit task-needs-attention result rather than generating anew silently. Backoff is bounded, with unknown reset time represented as unknown. No retry loop purchases capacity.

## S9. Readiness and test stages

For `pi-free`, retain top-level `ready`, `missing`, `liveChecksPerformed`, and add independent stage results:

1. `configured`: adapters, routes, paths, tools, permissioned sources and posting setup are coherent.
2. `locallyTested`: ARM64 tools exercised; an approved sample is bound to actual file/review hashes; required current-profile capability test receipts exist.
3. `connectionsVerified`: explicit recent Codex/search/Page-read probes and selected Telegram delivery receipt exist. Use a 7-day default expiry for connection receipts and invalidate on identity/config changes.
4. `liveVerified`: separate per-format selected Facebook post + read-back receipts. Not established by Page-read access or fixture tests.

`ready` for this profile requires stages 1–3 and the approved sample, but neither a full 90-day library nor a prior public Facebook post. Report coverage/storage/throughput separately. This preserves bootstrap: the local sample command works with only its production dependencies, even while full doctor is false. `ready` does not imply activated publication. `liveChecksPerformed` describes the current doctor invocation (false for ordinary doctor), while receipt dates describe prior explicit probes. Keep old profiles compatible and never convert a legacy truthy sample flag into new live verification.

The first sample: one authorized original-Bangla clip, custom/unscheduled, notifications queued, no Facebook calls. The next check sends only that preview to the selected Telegram operator. A daily-volume benchmark then exercises 3 distinct sources + image + text in preview and records elapsed time, peak memory, disk growth, output quality and quota deferrals. Steady-state pass requires one complete package within 24 hours without swap/OOM exhaustion, storage guard breach or lowered review requirements; actual reserve growth is reported separately.

## S10. Acceptance and delivery

All implementation tickets have deterministic tests and a completion record. Fixture passing establishes implementation only. On-device ticket 29 establishes the local sample/connection receipts. Ticket 30 is optional until the operator authorizes public testing; recurring activation is separate again.

Deliver the spec, contracts, acceptance scenarios, source notes, operator runbook and numbered tickets. See [README](README.md) for dependencies and [acceptance](acceptance.md) for the integrated completion bar. Source/config files are not changed by this documentation task. The new local tracker remains ignored under the existing `.scratch/*` rule; if versioning is desired later, explicitly include only this feature's Markdown, preserving unrelated scratch work.
