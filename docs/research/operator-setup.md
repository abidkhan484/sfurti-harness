# Research → Content Engine operator setup

The engine can be developed and tested offline with deterministic fixtures. That is not live readiness: do not enable research production or submit Page content until each relevant integration is verified locally and the operator has explicitly authorized a live sample.

## Machine setup tasks

Three companion setup guides are available:

- Cognee: local service, durable indexing, provenance/deletion checks, and configuration handoff.
- Piper bn_BD: local voice installation, model/card/hash verification, Bangladeshi listener review, WAV validation, and FFmpeg readiness.
- Docker Compose: reproducible local harness/services runtime with persistent volumes and research disabled by default.

Their detailed instructions will live in `docs/research/` and must be followed before setting `research.enabled` and `productionMode: "evidence"`.

## What the operator provides

Store values only in `.env` or the configured secret manager; never commit values, browser session files, model files, or Page tokens.

| Integration                 | Needed from you                                                                                        | Proof before live use                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Cognee                      | Reachable local service URL and any required token stored via an environment-variable reference        | Health, upsert, asynchronous ready state, provenance lookup, and deletion/tombstone check                |
| Piper                       | Local executable, `bn_BD` voice/model/card paths and their recorded hashes                             | License/model-card review, intelligible Bangladeshi listener sample, WAV metadata check                  |
| Media tools                 | FFmpeg and a Bangla-capable font path                                                                  | Deterministic PNG, audible AAC MP4, metadata/OCR/ASR inspection                                          |
| SearXNG                     | Operator-controlled JSON-enabled endpoint                                                              | Bounded neutral and counter-evidence query sample; no credential leakage                                 |
| Facebook Page               | Page ID, access-token environment variable, verified current API/version and required Page permissions | Explicit operator-authorized text/photo/Reel sample plus reconciliation; upload alone is not publication |
| Optional browser collection | User-established storage-state file and allowed public/authenticated origins                           | Read-only permitted source collection; login walls remain `authentication_required`                      |

## Configuration boundary

The safe default is `productionMode: "legacy"` with `research.enabled: false`. Evidence mode requires both an explicit configuration edit and validated eligible content; it does not itself authorize a live post. Keep token values out of JSON configuration: use names such as `SFURTI_COGNEE_TOKEN` and `SFURTI_FACEBOOK_PAGE_TOKEN` only as environment references once the respective adapters are implemented.

## Operator handoff checklist

1. Complete the Cognee and Piper local checks documented by their setup tasks.
2. Run `npm run typecheck`, `npm run lint`, and `npm test` after configuration changes.
3. Run `npm run sfurti -- doctor`; treat its configured/local/live states separately.
4. Use dry-run commands before any external call. Dry-run must make no mutation, provider, media, or publication call.
5. Give an explicit command before the single live Page sample. Record the returned remote ID/status and reconcile it before treating the delivery as confirmed.
