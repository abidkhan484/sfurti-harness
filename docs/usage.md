# Operating the Sfurti harness

**Status:** this guide specifies the intended operating interface. The harness is not implemented. Commands below are proposed command contracts, not commands that work today. The JSON example is syntactically valid, but no configuration loader or runtime validator exists yet.

Production fills a content library; the publishing scheduler selects approved, unpublished, topic-relevant items, preferring older eligible content while enforcing source diversity and avoiding repetition. Maintain at least 90 days of planning across enabled types where provider capacity permits; planning may extend further. Requests and results use a private Telegram bot conversation restricted to the configured operator.

## Initial setup

1. Confirm the [design](harness-design.md) before implementation. Use the [mission](mission.md) as the shared editorial reference.
2. After implementation, prepare one machine that can remain running for production and delivery work. Give it a persistent, writable data directory. Keep SQLite and the media directory together in the backup plan.
3. Copy `config/harness.example.json` to `config/harness.json` and `.env.example` to `.env`. These are intended project-root paths. Edit the topic, counts, and local storage paths.
4. Configure the Codex provider and verify its existing authentication. Do not assume a particular subscription, authentication mode, or additional fee. Configure the YouTube discovery adapter, editing/transcription/dubbing tools, Facebook Page integration, and Hermes channel separately. Verify each adapter before enabling publication; exact setup commands depend on the selected tools and account configuration.
5. Supply permission evidence and authorized source files using the source-registration interface below. A discovery result can be stored before permission exists, but editing must wait for clearance.
6. Supply the Sfurti logo or approved brand treatment, a Bangla-capable font, and the reusable mission-image layout. Test that captions and image text render correctly.
7. Run the one-time posting-window research workflow. Save time windows in `config/posting-windows.json` with the timezone, evidence URLs, research date, and limitations. Set the minimum spacing, which remains `null` in the example pending agreement. Plan for at least 90 days of each configured daily count; build content gradually under provider and workload limits.
8. Test a custom request without publication, inspect stored lineage and review findings, then verify an explicitly requested test publication. Enable the daily service only after the integration checks in [architecture](architecture.md#verification-before-enabling-the-service) pass.

Current external integration details still to establish: exact Hermes/editor installations, selected local audio tools, Facebook Page credentials and eligibility, Telegram operator configuration, posting windows and spacing, workload limits, and final brand assets. Do not paste secrets into documentation or commit them.

## Configuration

The proposed precedence is built-in defaults, then the selected JSON configuration, then explicitly supplied environment overrides. `SFURTI_CONFIG` chooses the JSON file. The agreed count overrides are:

| Setting | JSON field | Default | Meaning |
| --- | --- | --- | --- |
| `DAILY_VIDEO_COUNT` | `daily.videos` | 3 | Reels from distinct source videos |
| `DAILY_IMAGE_COUNT` | `daily.images` | 1 | Mission-image posts |
| `DAILY_TEXT_COUNT` | `daily.texts` | 1 | Text posts |

Counts must be nonnegative integers. Zero disables the corresponding daily content type; it does not block an explicit custom request. With every count at zero, there is no daily production requirement. Negative, fractional, or malformed values must fail validation rather than silently fall back to defaults.

For example, to request two Reels, no images, and one text post:

```dotenv
DAILY_VIDEO_COUNT=2
DAILY_IMAGE_COUNT=0
DAILY_TEXT_COUNT=1
```

Edit `topic` in the JSON file to change the recurring subject. Environment values override JSON values, so remove or change a count override if an edit to the JSON count appears ineffective. A service restart may be needed to load a changed environment; the implementation must document the service manager's exact restart command.

The first daily job seals the effective settings for that Bangladesh calendar day. Later triggers and restarted workers use that snapshot. Changes apply to future local plans: rebuild those plans using the new settings, retain files, return displaced content to the library, and update the CSV. Preserve today's snapshot and posts already confirmed by Facebook. Reconcile uncertain remote submissions before deciding whether a post is still local and safe to rearrange.

Scheduling must validate that the requested number of posts fits within the available windows and minimum spacing. If it does not fit, report a configuration error or shortfall; do not silently reduce spacing, increase counts, or post outside the windows.

## Daily operation

At 06:00, 07:00, and 08:00 Asia/Dhaka, the main process checks the day's scheduled package:

1. Skip overlapping daily work. If the day's required artifacts are approved and assigned times, no further production for that package is needed; its publication tasks continue independently.
2. Select eligible content from the existing library first. Create or resume only missing production. A missed trigger waits for the next slot; do not create a backlog of missed dates.
3. When production is needed, generate and store Bangla-first search phrases from the configured topic. Search YouTube, store deduplicated video metadata and query matches, and qualify the sources.
4. Preserve promising sources without permission as pending candidates. Produce only from cleared sources.
5. Generate Reels, mission images, and text posts into the library. Store original source intervals, translations, artifact versions, and edit evidence.
6. Independently review every artifact. Review at most three versions: the initial version and up to two corrections. Approve passing work automatically; retain unresolved failures and their review history. Manual retry is explicit. Permission and mission requirements remain mandatory; speaker credibility alone cannot support a material claim.
7. The planning scheduler selects approved, unpublished, topic-relevant artifacts, enforcing the daily counts, different Reel sources, and variety. Assign future times within saved windows and persist them. Continue planning beyond the current day and beyond 90 days when capacity permits.
8. The Facebook component submits local plans when the platform accepts their dates, retains remote IDs, and reconciles remote scheduling/publication. Update the filesystem CSV and report selected daily content, custom results, and actionable failures through Telegram.

Production attempts are not post times. A successful 06:00 run may schedule content for much later. A long-running job is not terminated at 07:00 or 08:00; those triggers skip while it remains active.

If content is ready after its assigned time, choose another suitable slot that day while preserving spacing. If none remains, keep the artifact available for the next day and report the current shortfall.

## One-time posting research

The setup workflow collects evidence and saves candidate windows. Broad internet research is an initial basis, not proof of an optimal time for Bangladeshi parents. Record that limitation with the research.

After setup, the random-time tool reads those windows; it does not research again or ask an LLM to invent a new range. Persist a selected time before publication is requested. Retrying a job reuses the saved time unless it has become unusable. Only an explicit operator request changes the saved windows.

## Provider capacity and reserve work

With default counts, 90 days requires 270 approved unpublished clips, 90 images, and 90 text posts with assigned times. Build this gradually; empty topic slots do not count. Report actual daily coverage and gaps, not just aggregate artifact totals. Already scheduled but unpublished content counts toward coverage and must not be allocated a second time. Current daily shortages and explicit custom requests take priority over reserve replenishment.

Reserve generation continues throughout the day beyond the three morning triggers and above the 90-day floor whenever provider capacity, storage, and configured workload limits permit. It does not increase daily publication counts. Telegram sends selected daily content, custom results, and actionable failures, with summaries for reserve work instead of every reserve artifact.

Ask the provider adapter for remaining capacity when supported. Per-turn token usage is not a remaining account allowance. When capacity is unknown, enforce configured workload limits and pause on provider limit errors until work can resume. Do not start an unbounded backlog or silently switch to another provider.

## External dependencies

Install the selected Hermes and editor repositories as subrepositories using the planned installation interface. No installation command exists yet. Follow [manual dependency updates](dependency-updates.md) for the intended update procedure; updates must never run automatically with daily jobs.

## Custom requests through Hermes

Examples of intended requests:

- “Create one Bangla Reel about creative play for ages 6–9.”
- “Create and schedule one Bangla Reel about building with cardboard for ages 10–12.”
- “Show today's approved videos and scheduled post times.”
- “Show sources awaiting permission.”

The first request returns its result without publishing. The second explicitly requests scheduling. Both create additional jobs and leave the daily topic, counts, and completion unchanged. Custom work follows the same permission, review, and duplicate rules.

Hermes is an interface to the harness, not a second owner of its job state. It should invoke the harness command/tool interface and report persisted results. Media must be accessible to the selected Hermes delivery integration; returning an arbitrary local path alone may not deliver the file.

## Proposed command interface

These commands are names to implement. There is currently no `sfurti` executable.

| Proposed command | Intended behavior |
| --- | --- |
| `sfurti config validate` | Validate configuration and report unresolved setup fields |
| `sfurti doctor` | Check local storage, provider and tool availability, and integration readiness |
| `sfurti start` | Start the coordinator, production triggers, workers, and publication monitoring |
| `sfurti status --date YYYY-MM-DD` | Show requirements, approvals, schedules, publications, and shortfalls |
| `sfurti request --topic "..." --age "6-9" --videos 1` | Create an additional job that returns its result |
| `sfurti request --topic "..." --videos 1 --schedule` | Create an additional job with explicit publication intent |
| `sfurti sources pending` | List discoveries awaiting permission/source files |
| `sfurti source register --youtube-id ID --file PATH --permission-file PATH` | Associate an authorized original file and evidence with a source |
| `sfurti job retry JOB_ID` | Resume retryable unfinished work without duplicating accepted output |

Source registration should retain the permission scope, attribution requirements, any expiry or restrictions, and evidence location. A permission record must cover the intended editing, translation where applicable, and Facebook use. An LLM cannot create permission by judging a video suitable. No automatic creator outreach is part of this interface.

## Results and storage

Every upload-queue item must appear in the filesystem CSV at `posting.queueCsvPath`, initially `data/exports/upload-queue.csv`. SQLite remains the previously agreed structured state store. No manually edited CSV command-import behavior is defined.

CSV columns: `queue_id`, `artifact_id`, `content_type`, `topic`, `age_segment`, `file_path`, `caption_or_text`, `source_video_ids`, `scheduled_at`, `timezone`, `status`, `facebook_post_id`, `published_at`, and `last_error`. Use UTF-8 and proper quoting for Bangla and multiline text. Keep terminal rows as publication history; filter status to see pending work. Exact source intervals remain in the database.

The implementation should refresh the CSV after queue changes by writing a complete temporary file and atomically replacing the prior export. Rebuild it from SQLite after an export failure or restart; report a stale export rather than presenting it as current. There is no transaction spanning SQLite and a CSV file, so an export failure must not lose or duplicate queue work.

Planned layout:

```text
data/
  sfurti.sqlite
  media/
    sources/<source-id>/
    videos/<artifact-id>/versions/
    images/<artifact-id>/versions/
    texts/<artifact-id>/versions/
  permissions/<source-id>/
  exports/upload-queue.csv
  backups/
```

Use stable IDs for directory names, with readable topics and captions in database/CSV metadata. Each version keeps its media or text payload, edit/translation evidence, and review references. A local backup directory is a configurable destination, not protection against loss of the whole machine; document external backup setup when selected.

Assign times locally for future content even when the platform cannot yet accept that schedule. Submit when eligible and track `planned`, `scheduled_on_facebook`, and `published` separately. A local date or CSV row is not evidence of successful remote scheduling.

Use `storage.databasePath` for structured records and `storage.mediaDirectory` for persistent artifacts. The planned records include keyword history, source metadata and permission, original segment timestamps, reviews, rendered paths, daily configuration snapshots, selected posting times, and remote post IDs.

Store original and dubbed transcripts, subtitle files, review evidence, and final renders with their artifact IDs. Keep a stable association between every clip and its source intervals so another job can identify previously used segments. Distinct intervals from a previously used source may be eligible on another day; the daily video package still requires different sources within that package.

Approved source segments count as used even when the clip is in the unpublished reserve. Scheduling that existing reserve artifact does not create a new use of its source segment. Regenerating the same excerpt as a new clip requires explicit reuse authorization.

Initially retain authorized sources, published outputs, and failed versions in a structured layout without automatic deletion. Provide storage reports and an explicit cleanup command that previews its effects. Pause generation and alert the operator if free space is insufficient. Do not delete artifacts that pending publication or review still references. Back up SQLite consistently with its referenced media and permission files; the backup destination and cadence remain to be selected.

## Recovery

| Situation | Expected response |
| --- | --- |
| Process crashes | Restart, recover durable state, and resume unfinished stages after reconciling worker ownership |
| No qualifying source | Try eligible reserve content; otherwise report the shortfall |
| Review rejects a clip | Revise the same clip within its persisted iteration limit; mark failed if unresolved |
| Model/tool is unavailable | Record a retryable failure; later work resumes without losing successful stages |
| Facebook request times out | Reconcile the remote result before retrying; never blindly create another post |
| Facebook schedules a post but publishing fails | Retry or report delivery failure; retain the approved artifact |
| Posting window has passed | Move to the next feasible slot or retain for tomorrow |
| Custom job fails | Report that job independently; it does not fulfill or cancel daily work |

Exact error codes and recovery commands must be updated alongside implementation. This guide does not claim recovery behavior is already available.
