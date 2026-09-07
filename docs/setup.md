# Setup and usage

This project is a Node/TypeScript harness. It runs locally, but live media generation, Telegram, and Facebook publishing require additional adapters and credentials.

## Install and initialize

From the project root:

```sh
npm ci

cp config/harness.example.json config/harness.json
cp .env.example .env
```

Node `24.12.0+` is required.

## Validate the local setup

```sh
npm run typecheck
npm test

npm run sfurti -- config validate
npm run sfurti -- doctor
```

`doctor` reports whether the live setup is ready. Configuration validation and local application tests do not establish that external services, media quality, or Facebook account access work.

## Configure integrations

Edit `config/harness.json` and configure the required adapter wrappers under:

```json
{
  "integrations": {
    "editor": {},
    "media": {},
    "discovery": {},
    "reviewer": {},
    "facebook": {},
    "hermes": {}
  }
}
```

Each adapter is an executable wrapper implementing the JSON-line protocol described in [docs/integrations.md](integrations.md).

You also need:

- Codex authentication and model configuration.
- Authorized source video files and permission evidence.
- Bangla-capable editing, media inspection, transcription, and audio tools.
- Facebook Page/API credentials and scheduling permissions.
- Telegram credentials and a private operator identity, if Telegram control is needed.

Do not install unspecified Hermes or editor repositories; their URLs and revisions have not been verified in this project.

## Configure posting windows

Create `config/posting-windows.json` with researched windows, evidence URLs, timezone, and limitations. Then set:

```json
"posting": {
  "windowsFile": "./config/posting-windows.json",
  "minSpacingMinutes": 60
}
```

The service will not start until posting windows, adapter configuration, and an operator-attested verified sample are available.

## Useful commands

```sh
npm run sfurti -- status
npm run sfurti -- storage
npm run sfurti -- request --topic "শিশুর সৃজনশীলতা" --texts 1 --request-id custom-001
npm run sfurti -- plan --days 90
npm run sfurti -- tick
npm run sfurti -- export-queue
npm run sfurti -- reconcile
npm run sfurti -- publish
npm run sfurti -- start
```

Register an authorized source:

```sh
npm run sfurti -- source register \
  --youtube-id VIDEO_ID \
  --language bn \
  --file /path/to/source.mp4 \
  --permission-file /path/to/permission.json
```

For custom content, scheduling must be explicit:

```sh
npm run sfurti -- request \
  --topic "শিশুর সৃজনশীলতা" \
  --texts 1 \
  --request-id custom-001 \
  --schedule
```

Use `npm run sfurti -- help` for the complete command list. Runtime state is stored under `data/`; the database is `data/sfurti.sqlite`, and the upload queue is exported to `data/exports/upload-queue.csv`.
