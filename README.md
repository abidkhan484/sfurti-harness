# Sfurti harness

A planned single-machine Node harness for discovering, producing, reviewing, and scheduling Bangla Facebook content aligned with Sfurti's mission.

**Current status: design and operating documentation only.** The repository contains the Codex SDK dependency but no implemented harness, workers, database migrations, or runnable harness commands. Nothing in this repository currently generates or publishes content automatically.

## Start here

- [Published issue spec](.scratch/sfurti-harness/spec.md): 68 user stories, confirmed testing boundary, and implementation scope; status `ready-for-agent`.
- [Operating guide](docs/usage.md): configuration, setup, daily work, custom requests, and recovery.
- [Requirements](docs/harness-design.md): consolidated decisions and implementation/setup checks.
- [Architecture](docs/architecture.md): proposed components and persistence model.
- [Mission](docs/mission.md) and [glossary](CONTEXT.md): editorial principles and terminology.
- [Configuration example](config/harness.example.json) and [environment example](.env.example).

The initial daily package is three Reels from different source videos, one mission image, and one text post. Counts are configurable; zero disables a type. Production opportunities occur at 06:00, 07:00, and 08:00 Asia/Dhaka. Approved content is scheduled into saved posting windows; additional custom requests do not replace the daily package.

Background production continues beyond those morning checks. Maintain at least 90 days of approved content with assigned posting times, and continue beyond that floor when capacity permits. An independent scheduler selects library content and tracks local plans, Facebook-confirmed schedules, and publication. Every upload-queue item is also stored in a filesystem CSV.

The user has confirmed the product requirements and testing boundary. Engineering skills use the local Markdown tracker and conventions linked from [AGENTS.md](AGENTS.md). See the operating guide's setup checklist for integration details still to supply or verify.
