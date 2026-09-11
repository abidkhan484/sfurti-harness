# Sfurti harness

A single-machine Node/TypeScript harness for Bangla content production, independent review, library planning, and Facebook publication through replaceable adapters.

The durable application runtime and controlled adapter tests are implemented. **Live production is not enabled:** external tool installations, authenticated integrations, brand assets, researched posting windows, and a verified end-to-end sample still need operator setup. The supplied configuration deliberately leaves those unset.

## Run locally

Requires Node 24.12 or later. Uses built-in SQLite (currently experimental in Node).

```sh
npm ci
npm run typecheck
npm test
npm run sfurti -- help
npm run sfurti -- config validate
npm run sfurti -- doctor
```

Copy `config/harness.example.json` to `config/harness.json` and `.env.example` to `.env`. Counts are configurable; zero disables a daily type. Do not enable the service until `doctor` reports the setup complete and the live checks in [integration setup](docs/integrations.md) have been performed.

## Research engine setup

The Research → Content Engine is additive and remains disabled by default. Before enabling evidence mode, follow the [operator checklist](docs/research/operator-setup.md), [Cognee setup](docs/research/cognee-setup.md), [Piper bn_BD setup](docs/research/piper-bn-bd-setup.md), and [Docker Compose guide](docs/research/docker-compose.md). These guides cover local validation only; an explicit operator command and remote reconciliation are still required for any Page publication.

## Operating boundaries

- `src/app.ts` exports `createHarness(...).execute(command)`, shared by CLI, coordinator and authorized Telegram requests.
- SQLite owns permissions, immutable artifact versions, review history, segment reservations, jobs, plans and posts. CSV is a retained-history projection with recoverable export status.
- An independent reviewer receives actual inspected evidence. Each attempt has at most three versions; explicit manual retries preserve a linked failed attempt.
- Custom requests remain additional work and require explicit scheduling intent. Library size never increases daily posting counts.
- The planner assigns saved random times to actual approved artifacts, reports per-date shortages over at least 90 days, and can continue farther. Publication reconciles uncertain outcomes before retrying.
- The coordinator bounds concurrent and daily workload, recovers leases, and prioritizes custom requests and daily shortages over reserve generation.

See [usage](docs/usage.md), [adapter/setup protocol](docs/integrations.md), [architecture](docs/architecture.md), [mission](docs/mission.md), and [glossary](CONTEXT.md). The implementation spec remains in the local tracker at `.scratch/sfurti-harness/spec.md`.
