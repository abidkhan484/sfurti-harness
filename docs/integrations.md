# External integrations

The harness implements adapter contracts and a Codex SDK strategy. It has **not** installed Hermes/editor subrepositories, authenticated services, validated Bangla media on real samples, or made a Facebook/Telegram request. Missing adapters fail the requested operation. Local tests exercise process boundaries and workflow fakes; they do not establish live account eligibility or media quality.

Configure `integrations` in the harness JSON configuration. The keys `editor`, `media`, `discovery`, `reviewer`, `facebook`, and `hermes` each accept:

```json
{"executable":"/absolute/path/to/wrapper","args":[],"cwd":"/absolute/path/to/dependency","env":{},"timeoutMs":120000,"maxOutputBytes":1048576}
```

Each wrapper must implement the protocol below. Commands use an argument array, never a shell. Only PATH, LANG and explicitly configured environment values reach the process. Keep secrets in a private local configuration or wrapper-managed credential file, never in tracked configuration, CSV, arguments or logs. A wrapper must not launch detached background workers; the harness terminates the process group on timeout, excess output and completion on Linux. The aggregate stdout/stderr limit is enforced; raw stderr is intentionally excluded from application errors. Windows requires an external process supervisor for descendant containment.

## Process protocol

The wrapper reads one UTF-8 JSON line from stdin, performs one operation, and writes exactly one JSON response to stdout before exiting zero. Diagnostics go to stderr. A wrapper must enforce its own schema validation and allow only known operations.

```json
{"protocol":"sfurti/1","operation":"editor.create","payload":{}}
```

```json
{"protocol":"sfurti/1","ok":true,"result":{}}
```

```json
{"protocol":"sfurti/1","ok":false,"error":{"kind":"rate_limit","uncertain":false,"retryAfterMs":60000}}
```

Accepted external error kinds are `rate_limit`, `authentication`, `rejected`, and `transient`. Timeouts, nonzero exits and malformed replies have uncertain side effects. A caller must reconcile external publication before resubmitting. Never return an empty success for failed work.

| Operation | Input and required output |
| --- | --- |
| `discovery.discover` | Topic, mission and Bangla-first language. Returns `keywords` with stable `id`, `query`, `language`, `intent`; `sources` with `id`, `title` and source metadata; `matches` with `keywordId`, `sourceId`. Discovery does not grant permission. |
| `editor.create` | Artifact, exact source segments, authorized source, mission, version number, prior corrective findings, output directory and stable `idempotencyKey`. Returns nonempty `filePath`, `caption`, and original `segments` for video. Same key must retrieve the original render after timeout. |
| `media.inspect` | Actual file path, kind and source segments. Returns `valid`, technical measurements, and `evidence`: frame file paths, transcript, independent audio intelligibility/coverage, overall coverage and limitations. Never claim native audiovisual inspection from a transcript alone. |
| `reviewer.review` | Actual artifact version and independently collected evidence. Returns `passed`, boolean `criteria` for mission/claims/context/age/bangla/usability, and `findings` with version, location, criterion, evidence, correction, acceptanceCondition. A fresh review context must not inherit producer history. |
| `facebook.bounds` | Current ISO timestamp `now`. Returns verified `minLeadMinutes` and `maxLeadDays` for the configured Page/API/content capabilities. |
| `facebook.submit` | Stable queue `id`, approved `artifact`, and `scheduledAt`. Returns `remoteId` and `status` scheduled/published; optionally `publishedAt`. Persist the stable key-to-remote-ID mapping before responding. |
| `facebook.reconcile` | Saved post including correlation ID and remote ID if known. Returns status absent/unknown/scheduled/published/cancelled, with remote ID for scheduled/published. `absent` means authoritative absence across all attempts; inability to search by correlation ID means `unknown`, never absent. |
| `facebook.cancel` | Saved post. Returns cancelled only after remote confirmation, otherwise unknown. |
| `telegram.deliver` | Configured private operator `chatId`, text, optional artifact paths. Wrapper sends only to that operator; records delivery failures and retries independently. |

The generic Hermes adapter exposes `.call(operation,payload)` for a verified external bridge. Incoming operator commands use `TelegramOperator.dispatch(update)` and the same `app.execute` as the CLI. The dispatcher accepts only a private chat where sender and chat IDs both match the configured operator, requires an integer Telegram update ID, and attaches `commandId: telegram:<update_id>` for persistent application deduplication. This is an application boundary, not an implemented webhook or polling daemon. The bridge must verify Telegram transport authenticity and feed raw updates to this dispatcher; it must not execute arbitrary shell text.

Telegram configuration is `{"operatorUserId":"123456789","transport":{...process configuration...}}`. No fallback recipient exists. Configuring a transport enables application notification delivery; this setup has not sent any messages.

## Codex strategy

`integrations.codex` accepts an explicit `model`, either `apiKeyEnv` naming an environment variable or `authFile` naming a pre-authenticated Codex auth file, and optional positive `timeoutMs` and `maxOutputBytes`. Credentials are not embedded in prompts. A configured external reviewer takes precedence; otherwise the Codex strategy supplies the independent reviewer. Editors remain external processes; the strategy can also serve provider-neutral structured generation decisions through its public interface.

The implementation was checked against installed `@openai/codex-sdk` 0.153.2 TypeScript declarations: `startThread`, structured `outputSchema`, cancellation signal, local-image input, and usage fields. Installed CLI `features list` also exposes shell/unified-exec/tool feature flags. Each request uses a fresh temporary Codex home and working directory, no inherited environment secrets, read-only sandbox, no network tools or web search, and disabled shell, exec, browser, apps, plugins, hooks and code-execution features. Review frames are copied into the isolated evidence directory. Temporary auth and evidence copies are removed on completion. No producer thread is resumed. These settings follow the [official OpenAI configuration reference](https://developers.openai.com/codex/config-reference); deployments with administrator-mandated configuration must verify restrictions remain effective before enabling untrusted inputs.

Returned JSON is checked at runtime as well as requested through a schema. Required native video/audio capability fails explicitly: this SDK supports text and local images, not native video or audio input. Review must include independently inspected transcripts/audio and timestamped frame coverage; incomplete evidence cannot establish usability or fidelity. Token usage is recorded separately from quota; remaining capacity is always explicitly unknown for this SDK adapter. Conservative application workload caps still apply, and classified provider limits pause production.

## Install, update and rollback

Exact Hermes, editor, transcription/dubbing and image-tool upstream URLs and pinned revisions are **not yet supplied or verified**. Do not substitute a similarly named repository or install the latest moving branch. Once the operator supplies and verifies each upstream and immutable commit, run the following template with the actual values; these placeholders are intentionally not runnable defaults:

```sh
git submodule add <verified-editor-url> external/editor
git -C external/editor fetch origin <verified-editor-commit>
git -C external/editor checkout --detach <verified-editor-commit>
git submodule add <verified-hermes-url> external/hermes
git -C external/hermes fetch origin <verified-hermes-commit>
git -C external/hermes checkout --detach <verified-hermes-commit>
```

Follow each pinned project's own installation procedure in its isolated environment; implement a protocol wrapper and configure its absolute executable. Do not infer Python/Node dependency commands until the upstream is selected. Install no credentials in the subrepository. Verify the wrapper against a nonpublishing media sample, then run `npm run typecheck` and `node --test test/adapters.test.ts`. Commit `.gitmodules` and the verified gitlinks after review. Startup and daily work never fetch or update dependencies.

For a manual update, stop the service and all active dependency workers, record `git -C external/editor rev-parse HEAD` (and Hermes equivalent), and take a consistent backup of SQLite plus all media, authorized source/evidence files and private configuration. Copy the database only after all writers are stopped, or use SQLite's online backup API; copying an active main database without WAL is not a consistent backup. Store credentials separately with restricted access. Configure backup destination and cadence explicitly; the harness does not silently create an off-machine backup.

Fetch and check out a reviewed immutable revision, apply its documented migrations, run adapter checks and an actual Bangla render/review sample with publication disabled. Roll back by checking out the recorded old revision and restoring its compatible environment. If a migration changed persistent data, restore the matching stopped-service backup as well. Reconcile Facebook state before resuming submission after any restoration, because the remote service may have advanced beyond the local backup. Never delete remote confirmed posts merely to make restored local state match.

Remaining prerequisites: verified repositories/versions and wrappers; Codex authentication/model access; authorized source files and permission evidence; YouTube access and current metadata retention requirements; selected Bangla-capable local audio/image tools, brand assets and font; real audiovisual quality checks; Facebook Page/app permissions, supported content formats/current scheduling bounds and durable correlation lookup; Telegram credentials/private operator identity and authenticated bridge; tested backup/restore destination and cadence. No Facebook endpoints or API-version defaults are invented by this harness.

### Delivery recovery

`telegram.deliver` receives a stable `idempotencyKey`, a text payload and optional `artifactPaths`. The wrapper must retain delivery outcomes by this key and reconcile an uncertain send before retrying. Upload each file rather than treating a local path as a delivered attachment. The harness retries a bounded persistent outbox; Telegram outages do not stop production or Facebook reconciliation/submission.
