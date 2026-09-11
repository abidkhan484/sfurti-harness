# Docker Compose deployment

Docker Compose packages the Node harness and preserves its SQLite, media, exports, and
backup state in named volumes. It does **not** make the Research -> Content Engine live
ready. In particular, this repository does not pin a Cognee image/API mapping or package a
Piper voice in Docker yet; those are separate implementation and operator-verification
steps.

Research must remain disabled until its configuration and activation gate have been
implemented and deliberately enabled. The supplied Compose command performs no provider or
Page calls; it may initialize the persistent local SQLite store, but it is not a scheduler and
never publishes.

## What Compose runs

`docker-compose.yml` builds `Dockerfile` with Node `24.12.0`, the minimum supported runtime,
and starts the CLI as the unprivileged `node` user. It uses these named persistent volumes:

| Volume           | Container path | Purpose                                           |
| ---------------- | -------------- | ------------------------------------------------- |
| `sfurti-data`    | `/app/data`    | SQLite ledger, media, and generated queue exports |
| `sfurti-backups` | `/app/backups` | Operator-created backup destinations              |

The local `config/harness.json` is mounted read-only. It and `.env` are deliberately excluded
from the Docker build context. Never bake credentials, a Page access token, browser session
data, or a Piper voice into the image.

## Start with the safe local check

From the repository root, create private local configuration first:

```sh
cp config/harness.example.json config/harness.json
cp .env.example .env
docker compose build
docker compose run --rm sfurti
```

The default command is `doctor`. Its result distinguishes missing setup from readiness; a
successful container build or a configured adapter is not live verification.

Run any other supported CLI command explicitly. For example, inspect persisted state:

```sh
docker compose run --rm sfurti status
```

Do not use `start`, `publish`, or a research activation command as a first container command.
Only use a live publishing command after the application’s activation and operator-authorization
requirements are implemented and satisfied.

## Host prerequisites outside this image

The container has the harness only. Provider work must be installed, pinned, and tested before
it is enabled:

- **Cognee:** install and operate a release whose HTTP API mapping has been verified against the
  adapter documentation. Configure the endpoint through the future research configuration; keep
  the authoritative source/claim ledger in Sfurti SQLite. Do not substitute a guessed Cognee
  Docker image tag for that verification.
- **Piper:** install the configured local executable and exact `bn_BD` voice, including its ONNX
  file, config, model card, hashes, and license review. Run a Bangladeshi listener assessment
  and media/ASR inspection before treating narration as locally tested. A host executable cannot
  be mounted into this Linux container unless its binary and dependencies are container-compatible;
  use a purpose-built, tested provider image or a documented endpoint when the Piper adapter is
  available.
- **Media tools and fonts:** render/inspection adapters must be available in the selected runtime
  and have recorded Bangla font and asset provenance. Container presence alone is not evidence of
  valid rendered text, audible narration, or correct codecs.
- **Search and browser collection:** configure an operator-controlled SearXNG JSON endpoint and,
  if needed, an allowed-origin authenticated browser profile. Never copy personal browser
  credentials into the image or bypass login/challenges.

## Page credentials and secrets

Keep Page credentials solely in the ignored `.env` file or another operator-managed secret
store. The current adapter configuration decides exact variable names; do not invent names in
tracked Compose files. Pass only variables actually consumed by the verified Page adapter, and
keep tokens out of `config/harness.json`, command arguments, logs, exports, and backups.

After the Facebook adapter is implemented, verify its current API version, Page permissions,
token scope/expiry, and text/photo/Reel request schemas with a non-publishing capability check.
An upload acknowledgement is not publication. A real Page post requires an explicit operator
command and must record returned remote IDs, timestamps, and reconciliation status.

## Persistence, backup, and maintenance

Named volumes survive `docker compose run --rm` and `docker compose down`. Listing or removing a
volume is an operator data-management action; inspect and back it up before removal. The
application backup command must write to `/app/backups` (for example through its configured
destination) and its manifest/checksums must be verified before any retention cleanup.

To stop a long-running explicitly started service, use `docker compose stop`. This Compose file
does not set an automatic restart policy, so a failed or stopped process cannot silently resume
publishing work.

## Current readiness boundary

Offline Docker packaging is complete when the image builds and `doctor` runs. It is not proof of
configured search, Cognee indexing, Piper quality, media inspection, Page permission, Facebook
delivery, or feedback collection. Use the final research-engine doctor and live-verification
runbook once their dependent tickets are implemented; record each provider version, date, result,
and limitation there.
