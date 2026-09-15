# Operator preparation and first test

Status: ready-for-human
Implementation prerequisite: tickets 01–28

## What input is still needed?

No more product decisions are needed to implement this package. Defaults are fixed in spec S4. These are execution inputs, to provide privately on the Pi when setup is ready:

1. A 64-bit OS with Docker Compose available, actual free space, and the Pi's power/cooling condition. The current development workspace has not been verified as the Pi.
2. A ChatGPT Plus Codex login on the Pi. The operator completes the browser/device flow; no token/auth.json should be pasted into chat.
3. Facebook Page ID, supported app/Page access and a Page token stored in the designated private file. Owning a Page does not by itself prove API capability. The implementing agent must provide exact required scopes from ticket 18.
4. Telegram bot token in its private file and the private operator user/chat ID. Open the bot in Telegram and start the conversation. Confirm another bot service is not already consuming its updates.
5. One original-Bangla video with intelligible audio and at least one context-preserving 30–60-second usable segment, plus real evidence granting editing and Facebook reuse. For a full daily benchmark, provide three distinct eligible source videos; one source cannot satisfy existing diversity rules.

No new hardware, paid service, logo or publishing-time decision is required to start implementation. A simple Sfurti wordmark and research-backed provisional posting windows are agent work. If storage or cooling is inadequate in the measured test, report the limit before proposing changes.

## Commands available NOW, before implementation

From the existing checkout on the Pi, these gather non-secret environment/setup facts. They do not generate a video or make doctor ready:

```sh
uname -m
getconf LONG_BIT
cat /etc/os-release
free -h
df -h .
docker compose version
docker compose run --rm sfurti doctor
docker compose run --rm sfurti status
docker compose run --rm sfurti storage
```

Expect ARM64/aarch64 and 64-bit userspace for this profile. If these show a different OS/architecture, report it before reinstalling anything. The existing doctor is expected to remain false until integrations exist. The Node .env warning inside Docker is distinct from Compose env_file injection; do not copy secrets into the image to suppress it. Status may contain source/permission metadata after use: share only relevant sanitized output.

## Phase 1: after tickets 01–28 are implemented

The following commands are TARGET commands specified for implementation. They are not runnable against the current baseline. Ticket 28 must replace any discrepancy with verified CLI commands before handoff.

The implementation provides docker-compose.pi-free.yml, a non-secret config/harness.pi.example.json, a permission manifest template and setup instructions in docs/setup-pi.md. Configure local settings without replacing existing files; keep preview mode, current quotas and research disabled. Keep current named volumes. Set private credential file paths and readable ownership for the container's unprivileged user. Initialize the source inbox at ./data/inbox.

Complete Codex login using the installed pinned CLI in the documented dedicated auth location. For a headless Pi, the documented device-code flow may be used if available on the account. The implementation runbook must provide the exact host/container command and ownership; do not assume a workstation auth path works inside Docker. [Official authentication guidance](https://learn.chatgpt.com/docs/auth).

Build and start only the search dependency, then run explicit probes:

```sh
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml build
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml up -d searxng
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"setup-probe","target":"codex","requestId":"pi-codex-001"}'
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"setup-probe","target":"search","requestId":"pi-search-001"}'
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"setup-probe","target":"facebook","requestId":"pi-page-read-001"}'
```

These probes use the network and Codex subscription allowance; they do not send Telegram messages or create Facebook posts. Expected results identify target, passed/failed/partial/unknown, sanitized reason and saved receipt. A Codex allowance deferral is pending, not an instruction to buy capacity. Stop dependent sample work if auth fails.

## Phase 2: obtain a recommendation and supply an authorized file

Run existing discover through the new built-in adapter:

```sh
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"discover","requestId":"pi-discovery-001"}'
```

Inspect recommendations in status; outbound recommendation delivery is enabled only deliberately after transport setup. Discovery does not download the footage. Obtain permission and upload one corresponding original-Bangla file, or start with an already-owned/permitted source.

Place files under ./data/inbox/sample-001/ using the [submission format](contracts.md#source-submission). Set sourceId to the true original video ID, language to bn, original URL and accurate scope/restrictions/expiry. Add actual permission evidence. Create an empty READY file last, after all copies finish. An owner authorization note must state real rights, not a fabricated approval just for a test.

Run intake, then qualify the source. Replace SOURCE_ID with the manifest's actual sourceId:

```sh
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"intake-scan","submissionId":"sample-001"}'
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"qualify-source","sourceId":"SOURCE_ID","requestId":"pi-qualification-001"}'
```

Expected: one retained permitted source and one hash-bound qualification with usable intervals. A held source returns the precise permission/media/context reason. Correct the source input or choose another source; do not mark qualified manually.

## Phase 3: first real local preview

Run one sample while full doctor may still be false:

```sh
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"setup-sample","sourceId":"SOURCE_ID","requestId":"pi-sample-001"}'
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"setup-sample-status","requestId":"pi-sample-001"}'
```

Expected: one custom 30–60-second vertical clip, retained MP4 path, independent inspection/review, and approved or an explicit deferred/rejected result. There must be zero Facebook mutations and no Telegram send. Local notifications remain queued. This sample does not count toward the 3/1/1 daily package.

If deferred, rerun the identical setup-sample request only when its nextRunAt/reason permits; do not change request IDs to bypass quota or retry limits. After a process restart the same command resumes saved stages. Never set setup.verifiedSample by hand to bypass approval.

Ticket 28 must document copying/viewing the returned artifact from its named volume without exposing the entire data directory. Watch/listen for readable Bangla, preserved meaning, captions, no truncated speech and usable audio. Report concrete timestamped defects for correction.

## Phase 4: selected Telegram preview and attestation

After you choose to send the preview to your private bot chat, replace ARTIFACT_ID with the approved sample ID:

```sh
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"setup-send","artifactId":"ARTIFACT_ID","requestId":"pi-preview-send-001"}'
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"setup-attest","artifactId":"ARTIFACT_ID"}'
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti doctor
```

This selected send is an external message. It must upload the actual file or an explicitly labeled preview, not just print a local path. If the outcome is unknown, investigate the same delivery attempt; do not resend repeatedly. Attestation passes only with valid sample and setup receipts. Remaining missing gates are reported individually.

Expected doctor once all required checks pass: ready true, liveChecksPerformed false for this invocation, stages 1–3 satisfied, liveVerified false until public tests. Ready does not mean a full 90-day reserve, proven daily speed or permission to activate recurring posting.

## Phase 5: measure the unchanged daily workload

Import and qualify three distinct sources, pause other heavy production and run:

```sh
docker compose -f docker-compose.yml -f docker-compose.pi-free.yml run --rm sfurti command --json '{"type":"setup-benchmark","requestId":"pi-day-001"}'
```

This is a preview benchmark with isolated state: 3 videos, 1 image and 1 text. Keep normal quota settings intact. Save elapsed time, peak memory, disk growth, CPU temperature/throttling observations if available, quality failures and Codex deferrals. Passing one clip does not prove daily capacity. If the package cannot finish in 24 hours, report the measured bottleneck while retaining the target.

## Later: optional public Facebook test

Nothing above posts to Facebook. After explicit selection/authorization, ticket 30 uses publish-one bound to Page/artifact/hash. That action may create a publicly visible post. It must not drain the general queue or enable recurring publication. Record remote ID and read-back; uncertainty remains uncertainty. Continuous activation and removal of the test post require their own explicit operator actions.

## What to give the implementing agent next

Use the README handoff prompt to authorize implementation when ready. Provide sanitized environment outputs if execution will occur directly on the Pi. Keep credentials in the generated private file locations, and prepare the single video/permission folder. No further questionnaire is needed to begin the implementation tickets.
