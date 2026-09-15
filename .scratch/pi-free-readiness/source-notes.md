# Source notes and verification boundaries

Status: ready-for-agent
Checked: 2026-09-14

## Repository evidence

Read `src/maintenance.ts`, `src/adapters/{index,codex,llm,process,telegram}.ts`, `src/adapters/search/searxng.ts`, `src/{production,coordinator,planning,service,notifications,domain,store,config,app,cli}.ts`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `docs/integrations.md`, `docs/research/docker-compose.md`, CONTEXT and ADRs 0001–0005. Spec baseline is e8fa401. Recheck these files when implementing; filenames proposed in tickets do not yet exist.

## Official upstream references

- [Codex authentication](https://learn.chatgpt.com/docs/auth): ChatGPT login, headless device login and file-based cache are documented. Refreshed credentials must survive ephemeral jobs. The Pi adapter must verify compatibility with its installed SDK/CLI and retain review isolation. API keys are documented as the recommended automation default; this deployment deliberately uses the operator's ChatGPT login to satisfy their no-additional-spend requirement.
- [Codex pricing](https://learn.chatgpt.com/docs/pricing): Plus has included Codex usage subject to allowances. This does not establish that this particular daily workload fits. No exact quota or throughput is assumed.
- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html): supports query requests and JSON output when enabled. Use the existing bounded adapter against the operator's private service; upstream search quality/availability needs a real probe.
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html): text/subtitle capabilities depend on build libraries. Verify the selected ARM64 build and actual Bangla output instead of treating a successful install as layout proof.
- [whisper.cpp upstream](https://github.com/ggml-org/whisper.cpp): provides CPU inference and Raspberry Pi support. Select a pinned multilingual model; supported hardware is not proof of Bangla accuracy or this deployment's speed.
- [Telegram Bot API](https://core.telegram.org/bots/api): exposes polling and media send methods. The hosted API currently documents a 50 MB video/document upload limit; ticket 16 must verify limits and handle oversize output explicitly. No native exactly-once-send guarantee is assumed.
- [Raspberry Pi 5 product information](https://www.raspberrypi.com/products/raspberry-pi-5/): use ARM64 deployment and record power/cooling during the real workload benchmark. No claim is made that the current board has adequate cooling or power.

## Meta API verification still required

Attempts to fetch [Page posts](https://developers.facebook.com/docs/pages-api/posts/) and [Reels publishing](https://developers.facebook.com/docs/video-api/guides/reels-publishing/) returned HTTP 429 in this session. Search results from third-party sites were not used to establish API contracts. Ticket 18 must fetch official documentation and record a supported explicit version, scopes, content request/response schemas, upload phases, scheduling and reconciliation limits before dependent integration implementation. This remains agent work; account-specific eligibility is checked later with the operator's private credentials.

## Earlier setup context

A prior local workstation setup recorded Piper and a speaker-0 audition. This was consulted only to avoid replacing a prior voice choice; no machine-specific binary/auth path is assumed portable to the Pi. The Pi voice/runtime license, hashes and real sample must be checked independently. Cognee remains outside this legacy deployment's prerequisites.
