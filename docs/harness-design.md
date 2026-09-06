# Sfurti harness requirements

Status: product requirements and testing boundary confirmed by the user. The harness is not implemented. Setup values and integration checks are distinguished from agreed product behavior below; this document is not a replacement for the mission. The [published issue spec](../.scratch/sfurti-harness/spec.md) synthesizes these decisions and is marked `ready-for-agent` in the local tracker.

## Confirmed direction

- Serve Bangladeshi parents of children aged 3–15, with both general content and content specific to an age segment.
- Initially encourage parents to try useful activities and return for more content. The anticipated commercial direction is Montessori toys for creative learning, with no specific offer selected.
- Lead with constructive alternatives to passive consumption, supported by careful explanations where useful.
- Daily topic variations may include related creative play, parent-child interaction, and hands-on activities; store how each search angle connects to the configured topic.
- Discover sources broadly on YouTube, prioritizing original Bangla content and practical relevance to Bangladesh and developing-country settings.
- Relevance to Bangladeshi families takes precedence over creator location. Foreign activities should be adaptable to local materials, household space, and cost.
- Only render source material with documented reuse permission and an authorized source file; other discoveries remain candidates for permission outreach. Discovery does not itself authorize outreach.
- Finished content must be in Bangla. AI dubbing is acceptable for exceptionally valuable foreign-language content, but original Bangla is strongly preferred.
- Daily video, image, and text counts are configurable in an environment or configuration file. Initial defaults are three clips from different source videos, one mission image, and one text post. Custom requests remain additional.
- A zero count disables that content type. Use a configuration file with optional environment overrides. Snapshot the resolved configuration when the day's first job starts; later changes apply to the next day, not ongoing retries.
- Produce 9:16 Facebook Reels, 30–60 seconds each, with readable Bangla captions and framing that preserves the important action. Each clip has a separate render.
- Mission images use a consistent visual identity with a rotating Bangla mission message. Text posts offer one practical parent-child activity or thoughtful prompt, with an age label where relevant. Both require independent review before scheduling.
- Initially render mission images from reusable branded layouts with rotating Bangla copy. Newly generated AI illustrations are optional future work.
- Preserve the original source timestamps of clip parts for later reference and editing.
- A Reel may combine several intervals from its single source video when meaning is preserved. Add a short Bangla hook and optional practical closing prompt; distinguish Sfurti additions from the original speaker's words and review added claims.
- Exclude previously used or overlapping source segments while permitting genuinely different segments from the same source. Explicit manual reuse is possible for future compilations. Mark segments used when the strict review agent approves the clip, not on a failed render.
- Independently review up to three total versions of the same clip: the initial render and at most two corrections. Mark unresolved work failed; do not automatically substitute another source within that correction loop.
- Retain failed clips and review history for inspection and explicit manual retry. Exclude them from publishing; record a manual retry explicitly rather than silently resetting the automatic iteration limit.
- Apply the same initial-version-plus-two-corrections limit to images and text posts, with independent review and retained failed versions.
- The strict review agent automatically approves passing clips; human approval is no longer required. Review covers mission alignment, claim support, context, age framing, Bangla quality, media usability, and recorded source permission; code separately enforces permissions, duplicate checks, and iteration limits. Speaker credibility alone does not justify an unsupported material claim: retain supporting evidence, remove the claim only when meaning is preserved, or reject the excerpt.
- Schedule Facebook publication after approval, instead of publishing immediately. Approval, local planning, Facebook-confirmed scheduling, and confirmed publication are distinct events.
- Research posting-time windows once during setup and persist the resulting windows and supporting evidence. Subsequent scheduling uses a tool to draw random times within those saved windows, preserving spacing and persisting the choices so restarts do not reshuffle them. No recurring research or automatic window learning is requested.
- Skip further production for a daily package once it contains the configured approved content with assigned times. Independently retry pending Facebook submissions and publication failures without regenerating approved content. Local future planning cannot wait for distant dates to become eligible for Facebook submission.
- Maintain a reserve of approved, unpublished clips to fill shortfalls. If the reserve cannot satisfy the source-diversity and quality requirements, report the shortfall through Hermes rather than weaken acceptance criteria.
- Maintain at least 90 days of approved content with assigned posting times, built gradually subject to provider capacity: 270 clips, 90 images, and 90 text posts at the default counts. Empty calendar slots or planned topics do not count. Report actual complete-day coverage and gaps until the floor is met.
- Continue generating above 90 days when provider capacity, storage, and configured workload limits permit. The planning floor is not a stop condition, and a larger library never increases daily publication counts.
- If remaining provider quota is unknown, use configurable conservative workload limits, pause on provider limit errors, and resume when permitted. Prioritize daily shortages and explicit custom work over reserve production. Unknown quota never means unlimited capacity.
- Production stores generated content in a folder-backed library. The publishing scheduler selects approved, unpublished, topic-relevant items, preferring older eligible items while enforcing source diversity and avoiding repetitive subjects. Use persisted tags and review results without requiring an LLM for each selection.
- On topic/count changes, preserve today's configuration snapshot and posts already confirmed by Facebook. Rebuild future local plans using the new settings; retain all generated files, return displaced items to the library, and update the CSV. Never blindly rearrange a post with an uncertain remote submission outcome; reconcile it first.
- Reserve generation continues beyond the morning production triggers, subject to provider capacity and workload limits; it yields to higher-priority daily/custom work.
- Store every upload-queue item in a filesystem CSV with queue_id, artifact_id, content_type, topic, age_segment, file_path, caption_or_text, source_video_ids, scheduled_at, timezone, status, facebook_post_id, published_at, and last_error. Use UTF-8 and correct CSV quoting. Keep published, cancelled, and failed rows with final states. Exact synchronization mechanics remain implementation work; no manual CSV command-import behavior has been requested.
- Assign future times locally even beyond Facebook's supported scheduling window, then submit to Facebook when eligible. Distinguish planned, scheduled_on_facebook, and published. Planning may extend beyond 90 days.
- If content misses its selected posting time, use the next suitable slot that day while preserving spacing. If no slot remains, retain it for tomorrow and report the missed target.
- A custom Hermes request creates an additional task and leaves the scheduled task and default configuration unchanged.
- Return custom results by default. Schedule custom content only when the request explicitly asks for publication or scheduling.
- Custom approvals do not satisfy or suppress the normal daily requirement.
- Treat Hermes and the video editing tool as separate project components.
- Provide commands to install external projects as subrepositories and written instructions for future manual updates. Never auto-update dependencies. Verify the intended upstream identities and versions during setup; installation has not been performed.
- Use a private Telegram bot conversation for requests, results, and alerts, restricted to the configured operator user ID.
- Send the day's selected content and posting schedule, custom results, and actionable failures through Telegram. Summarize reserve generation rather than sending every reserve file; individual artifacts can be requested.
- Provide distinct controls to pause new scheduling and cancel selected scheduled, unpublished posts; preserve source and completed media files.
- Use Codex SDK as the initial LLM provider behind a Strategy interface so another SDK can replace it without changing the workflow.
- A main Node process orchestrates multiple workers for LLM and tool tasks, passes results to dependent components, and persists outputs in structured form.
- Initially run the main process and separate worker processes on one machine, with durable job state.
- Use SQLite for structured records and a persistent media directory for artifacts. Provide harness commands to register authorized source files and permission evidence; Hermes can invoke those commands.
- Organize published outputs, failed versions, and authorized source files in a structured artifact layout. Initially retain them without automatic deletion. Provide storage reporting and explicit cleanup with a preview; pause generation and alert on insufficient free space.
- Select replaceable local transcription/dubbing tools during implementation and validate Bangla quality on real samples. Paid external audio services require a separate decision; unsuitable dubbing fails review.
- Select age targeting automatically from the topic, with custom requests able to specify an age. Use configurable editorial labels: general, 3–5, 6–9, 10–12, and 13–15; validate the age relevance of claims and activities.
- Save otherwise suitable discoveries lacking recorded permission as pending candidates and continue searching. The user can later attach permission evidence and an authorized source file.
- Production triggers run at 06:00, 07:00, and 08:00 Asia/Dhaka. A missed trigger waits for the next slot. Skip while scheduled work is active; after failure, resume unfinished work from persisted results.
- Reserve source segments across scheduled and custom jobs to prevent concurrent duplicate selection.

## Implementation and setup checks

These do not change the agreed workflow and must be made concrete during implementation:

- Select and document bounded worker concurrency, task timeouts, retry/backoff settings, free-space threshold, and workload limits. Read remaining provider capacity when available and represent unknown capacity explicitly.
- Perform the one-time posting-window research. Configure spacing and validate capacity for daily plus scheduled custom posts. The previously proposed 90-minute spacing is a configurable starting suggestion, not a researched engagement claim or a confirmed fixed requirement.
- Verify exact external repository URLs, pinned versions, install commands, Codex authentication, and adapter capabilities. Hermes/editor defaults must be reconciled with the automatic-review workflow.
- Verify YouTube access, Facebook Page/app eligibility and scheduling constraints, Telegram bot credentials and allowed operator ID. No secrets belong in documentation or CSV.
- Select the local audio/image tools and supply brand assets and a suitable Bangla font. Test actual translation, audio, caption, and layout quality before enabling those paths.
- Use automatic age relevance and variety rather than inventing fixed quotas per age segment.
- Implement transactional segment ownership and release, durable publication reconciliation, and a regenerable CSV projection. Preserve unsuccessful review history so a fresh job cannot silently evade the correction limit.
- Provide structured storage, usage reports, explicit cleanup previews, and backup/restore instructions with operator-configured destination and cadence. No automatic artifact deletion is requested.

## Scope boundary

The first version serves one Sfurti Facebook Page from one machine, with a private Telegram operator interface. Custom jobs use the same workflow but remain additional. Automatic dependency updates, paid external audio services, direct CSV command imports, automatic deletion, and automatic edits to already published posts are not part of the agreed first version. Keep the mission stable and versioned separately from operating configuration.

## Documentation

- [Operating guide](usage.md): setup sequence, configuration, daily/custom operation, permission registration, and recovery. Commands describe the planned interface until implementation exists.
- [Architecture](architecture.md): component boundaries, proposed data model, review evidence, scheduling, and implementation verification.
- [Mission](mission.md): principle-based reference distilled from the user's supplied mission; operating choices remain in this design document.
- [Configuration example](../config/harness.example.json) and [environment example](../.env.example): proposed configuration contract, not a working runtime.
