# Operating the Sfurti harness

The application runtime is implemented and tested with controlled external adapters. No live provider, video rendering/dubbing, Telegram delivery, or Facebook publication has been verified for this installation. `start` requires configured adapters, researched posting windows and an operator-attested approved sample. See [integration setup](integrations.md) for the remaining checks.

## Setup

1. Install Node 24.12+ and run `npm ci`.
2. Copy `config/harness.example.json` to `config/harness.json`, and `.env.example` to `.env`.
3. Configure external process adapters as described in [integrations](integrations.md). Supply verified repository identities, tools, authentication, brand layout, Bangla fonts and local audio tools; the runtime does not install or update them automatically.
4. Research posting windows once. Save `config/posting-windows.json` with `timezone`, `windows` (objects with `start`/`end` in `HH:mm`), `evidence` URLs, `researchedAt`, and `limitations`. Set `posting.minSpacingMinutes`. Empty or impossible windows are rejected; the runtime never performs timing research.
5. Register authorized sources and run custom work without scheduling. Inspect actual output, review evidence and permissions. Verify an explicitly scoped test publication only after establishing Page eligibility and credentials.
6. Set `setup.verifiedSample` to the approved artifact ID and `setup.verifiedAt` to the date of that end-to-end verification. This is operator attestation, not a substitute for inspecting the sample. `doctor` does not make live calls.
7. Run `npm run sfurti -- start` under your chosen process supervisor. SIGINT/SIGTERM finish the active cycle before shutdown. Restart after configuration edits. Background cycles run at `limits.tickMs`. Daily recovery consumes a configured `daily.productionTimes` opportunity only in its current Bangladesh minute; missed opportunities wait for the next one. Reserve generation continues between opportunities without sealing today's settings. A JSON `tick` command with `daily:true` explicitly forces a daily recovery. Missed historical dates are not replayed.

## Configuration

Precedence: built-in defaults, `SFURTI_CONFIG` JSON, explicit application options, then environment count overrides. The CLI defaults to `config/harness.json` when present. All relative paths are project-root relative. `.env` is loaded by the npm command.

| Environment         | JSON field     | Default |
| ------------------- | -------------- | ------- |
| `DAILY_VIDEO_COUNT` | `daily.videos` | 3       |
| `DAILY_IMAGE_COUNT` | `daily.images` | 1       |
| `DAILY_TEXT_COUNT`  | `daily.texts`  | 1       |

Counts must be nonnegative safe integers. All-zero counts produce no recurring work. Custom requests are independent. Today's first daily workflow seals its settings. Future local plans rebuild for topic/count changes, preserving today's snapshot and Facebook-confirmed schedules; uncertain remote operations must reconcile first.

Operational defaults: one concurrent production artifact, five tasks per cycle, twenty new production/discovery tasks per Bangladesh day, a two-minute task timeout, a three-minute lease, one-minute provider backoff, and a 100 MiB free-space floor. Tune these after checking actual capacity. Unknown remaining quota never means unlimited work. The 90-day target describes approved timed coverage, not a promise to fill it immediately.

## Commands

```sh
npm run sfurti -- config validate
npm run sfurti -- doctor
npm run sfurti -- status
npm run sfurti -- request --topic "শিশুর সৃজনশীলতা" --texts 1 --request-id custom-001
npm run sfurti -- plan --days 90
npm run sfurti -- tick
npm run sfurti -- publish
npm run sfurti -- reconcile
npm run sfurti -- pause
npm run sfurti -- resume
npm run sfurti -- export-queue
npm run sfurti -- storage
npm run sfurti -- cleanup-preview
npm run sfurti -- backup --destination /path/to/new-backup-directory
```

`request --schedule` explicitly schedules custom output. `pause` stops new remote submissions and differs from cancelling posts. `cleanup-preview` lists files and sizes and never deletes them. `tick` performs bounded production/planning; `publish` performs remote actions and should only be invoked with established test or production authorization.

Every command is available through JSON:

```sh
npm run sfurti -- command --json '{"type":"coverage","days":90}'
npm run sfurti -- command --json '{"type":"cancel","postIds":["POST_ID"]}'
npm run sfurti -- command --json '{"type":"artifact","artifactId":"ARTIFACT_ID"}'
npm run sfurti -- retry ARTIFACT_ID --reason "Corrected source evidence and editor setup"
```

`commandId` provides durable replay suppression (used for Telegram update IDs). An interrupted accepted command reports `uncertain`; inspect persisted state before retrying under a new identity. Production `requestId` also identifies recoverable work. It cannot be reused for a different request. Explicit retry creates a linked attempt when editorial review is exhausted; historical versions remain intact.

## Sources and production

Discovery stores Bangla-first keywords, source identities, qualification evidence and query matches. Discoveries cannot establish permission. Automatic video selection requires cleared source files, supported qualification, topic relevance and original intervals. Missing qualified sources remain a reported shortage; no excerpt is invented to fill a quota.

```sh
npm run sfurti -- source register --youtube-id VIDEO_ID --language bn --file /path/to/source.mp4 --permission-file /path/to/permission.json
```

The permission JSON must contain `evidencePath`, a machine-readable `scope` array containing `edit` and `facebook`, and `translate` for non-Bangla sources. Include `attribution`, `expiresAt`, and `restrictions` where applicable. Unresolved restrictions block production. Source files and permission evidence are copied into retained, hashed paths. A direct video request uses `sourceId` and `segments:[{startMs,endMs}]` through the JSON command interface. Overlapping segments require explicit reuse authorization and cannot bypass an active owner.

Each output is retained under the configured media directory by kind, artifact ID and version. Actual media inspection must provide timestamped frames, transcripts, technical measurements, audio evidence and declared coverage/limitations. Missing evidence rejects the version; schema-valid JSON alone is insufficient. Corrections name the version, location, failed requirement, evidence, requested change and acceptance condition.

## Telegram and delivery

The configured transport polls private bot updates and delivers operator notifications through the external process protocol. Only the configured numeric operator identity in a private chat is accepted. Requests are JSON application commands; natural-language Hermes interpretation requires a separately configured integration. Duplicate update IDs do not repeat commands. Never expose this trusted local command boundary as a public endpoint.

Custom outputs and failures produce notifications; reserve production uses summaries. Pending delivery records remain in status if transport is unavailable and a bounded outbox drain retries them during service cycles or through `drain-notifications`. Transport must deduplicate the stable `idempotencyKey` to reconcile a response lost after delivery. Daily selections include already-approved reserve artifacts and assigned times; unchanged summaries are suppressed. Telegram command results, including retrieval, also use this outbox. File delivery depends on the transport implementing media upload, not merely displaying a local path.

## Publication, CSV and recovery

Local `planned`, remote `scheduled`, and `published` states are separate. Before remote creation, the post becomes `submitting`; timeout leaves it uncertain. The adapter must authoritatively reconcile before declaring an absent post safe to create again. Publication and cancellation use a durable fenced lease across coordinators. Approved files and permissions are rechecked before submission.

CSV columns are `queue_id`, `artifact_id`, `content_type`, `topic`, `age_segment`, `file_path`, `caption_or_text`, `source_video_ids`, `scheduled_at`, `timezone`, `status`, `facebook_post_id`, `published_at`, and `last_error`. UTF-8 quoting preserves Bangla and multiline text. Published, failed and cancelled rows remain. The database is authoritative; manual CSV edits never control the queue. Atomic export failure records stale status and `export-queue` rebuilds it.

Stop all writer processes before backup. `backup` creates a consistent SQLite snapshot plus media and a manifest in a new directory. Keep an external copy on a configured cadence. Restore the database and media to the manifest's original absolute paths with all workers stopped, then rebuild the queue CSV. No automatic cleanup or backup scheduling is enabled.

## Verification

Run `npm run typecheck` and `npm test`. Tests use real temporary SQLite/filesystem storage with controlled provider, media, Facebook, clock and randomness adapters. They cover command replay, configuration snapshots, production limits and ownership, correction/evidence failure, planning coverage and spacing, remote uncertainty, CSV recovery and adapter protocols. These tests establish workflow behavior; live Bangla audiovisual quality and account-specific integration checks remain separate setup work.
