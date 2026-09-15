# Implementation contracts

Status: ready-for-agent

These are proposed contracts to implement, not commands/types already available. Existing `sfurti/1` wrapper result shapes remain supported; the Pi built-ins implement the same public operations. Paths below are container paths at runtime.

## Source submission

Directory `data/inbox/sample-001/`:

```text
video.mp4
permission.json
permission-evidence.pdf
READY
```

```json
{
  "schemaVersion": 1,
  "submissionId": "sample-001",
  "sourceId": "original-platform-video-id",
  "recommendationId": "optional-existing-recommendation-id",
  "originalUrl": "https://example.org/original-video",
  "title": "Descriptive original title",
  "language": "bn",
  "videoFile": "video.mp4",
  "permission": {
    "evidenceFile": "permission-evidence.pdf",
    "scope": ["edit", "facebook"],
    "restrictions": []
  }
}
```

The example is a format, not evidence of permission. Preserve actual restrictions/expiry and hold unsupported restrictions. `expiresAt` is optional valid ISO datetime; `translate` is additionally required for non-Bangla input. Resolve relative names only within this submission. Map evidenceFile to retained evidencePath for `register-source`. A manually supplied original is allowed without recommendationId; discovery remains needed for full deployment readiness.

Intake identity is `(submissionId, manifestSha256, videoSha256, evidenceSha256)`. Same identity is idempotent. Same ID with different hashes yields conflict requiring a new submission ID or explicit revision; never overwrite registered source lineage silently. Record `received | importing | imported | held | qualified`, reasons, retained paths, hashes, timestamps, current stage and lease. Write records in the existing durable store with additive migration; reuse source/permission records and do not invent a separate approval truth.

## Recommendation and qualification

Recommendation: `id, sourceId, canonicalUrl, title, language|null, topic, rationaleBn, observedEvidence[], tentativeSegments[], limitations[], discoveredAt, batchId`. Each observed evidence item has URL/file locator and retrieval date. Missing transcript means tentativeSegments is empty or explicitly unverified, never fabricated actual review.

Qualification: `sourceId, sourceSha256, missionVersion, topic, topics[], segments[{startMs,endMs}], evidencePath, evidenceSha256, reviewerIdentity, qualifiedAt, relevant, credible, actualContentReviewed, locallyRelevant, limitations[]`. The four booleans must follow actual inspection. Preserve current metadata fields consumed by coordinator. Segment timestamps refer to the original file, are in bounds, non-overlapping and total 30–60 seconds for each proposed clip. Store multiple segment sets as candidates without handing every candidate to one render. Allocation chooses one unused set and maintains current daily source diversity.

## Task and result records

Persist `taskId, stage, status, attempt, inputHash, outputManifest, provider, model, role, sessionRef, nextRunAt, quotaScope, leaseOwner, leaseUntil, errorCode`. Status enum: queued/running/deferred/completed/failed/needs-attention. Integrate with existing task records additively; one task cannot be completed by an obsolete lease owner. Do not keep secret tokens inside records. Sessions are private runtime files referenced by opaque task IDs.

Editor result retains `{filePath, caption, segments?}`. Add a manifest beside output: artifact/version/idempotency key, source and input hashes, tool/font/model versions, actual output hash, provenance and stage completion. Independent media evidence remains separately produced.

Media result retains `{valid, durationSeconds?, width?, height?, evidence}`. `evidence` contains actual text or timestamped frames, transcript and timed ASR spans, audio measurements and justified intelligibility result, explicit coverage/limitations, input hash, tools and inspectedAt. Absence of required evidence means valid false with actionable findings. All returned paths must resolve within allowed retained/scratch roots and exist.

## Deployment config contract

Ticket 01 introduces typed nested settings instead of arbitrary top-level flags. Use spec S4 values. Required groups: deployment(profile, executionMode), billing mode, intake(path/limits/cadence), local tools(paths/hash manifest/thread limits/stage deadlines), search(endpoint/budgets), storage budget, setup receipt policy and delivery enablement. Native integrations use discriminated config while preserving executable-based wrappers. Secrets are file references resolved by ticket 02.

A preview context cannot be elevated by an inbound payload. Live activation is a stored operator action bound to Page/config identity. One selected smoke operation is distinct from activation. Configuration snapshots and status must omit authentication file contents, token values and session content.

## Proposed CLI commands

Implement through the existing `command --json` entry point first; friendly aliases are optional. All names here are NEW except doctor/status/storage/config/discover.

| Type                     | Required input                                                  | Effect                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup-probe`            | `target`: codex/search/facebook; optional requestId             | Explicit bounded external read/inference, writes sanitized receipt; never sends/posts                                                                       |
| `intake-scan`            | optional submissionId                                           | Validate and register READY items; no external writes                                                                                                       |
| `qualify-source`         | sourceId, requestId                                             | Inspect actual source, call isolated Codex qualification, save candidate intervals                                                                          |
| `setup-sample`           | sourceId, requestId                                             | Produce exactly one custom preview video using one qualified interval set, schedule false, queue notifications only                                         |
| `setup-sample-status`    | requestId                                                       | Read sample job/artifact/stage and paths; resumable rerun uses same setup-sample payload                                                                    |
| `setup-send`             | artifactId, requestId                                           | Send only selected approved artifact/preview to configured private Telegram operator                                                                        |
| `setup-attest`           | artifactId                                                      | Validate approved hash-bound sample and current receipts, save verifiedSample/verifiedAt equivalently in durable setup state; do not rewrite mounted config |
| `setup-benchmark`        | requestId                                                       | Preview-only 3-video/1-image/1-text package with distinct sources; isolated benchmark state, no daily coverage credit                                       |
| `publish-one`            | artifactId, expectedSha256, pageId, requestId, confirmLive:true | Exactly one explicitly authorized public submission; persist selected authorization; does not activate service                                              |
| `activate-publication`   | pageId, confirmLive:true                                        | Enable continuous publication only after readiness; distinct durable activation receipt                                                                     |
| `deactivate-publication` | reason                                                          | Stop new submissions; retain/reconcile existing remote state                                                                                                |

`setup-sample` must be executable before full doctor ready. It checks source, auth, editor, inspector and reviewer only. A sample deferral is a resumable pending result, not approval. `setup-send` is not implicit in sample/attest. `publish-one` requires the same current integrity/permission/review gates as ordinary publication and may record uncertain status; it cannot manufacture a receipt when the remote state is unresolved.

## Readiness receipts

`id, schemaVersion, target, kind, checkedAt, outcome, configFingerprint, identityFingerprint, toolManifestHash?, artifactId?, artifactVersion?, artifactSha256?, remoteId?, evidencePaths[], limitations[]`.

Outcomes: passed/failed/partial/unknown. Kinds distinguish local fixture, native tool, Codex inference, search, Page read, Telegram send and Facebook publish/read-back. Only the relevant successful real receipt can satisfy a gate. No plaintext credentials in identity fingerprints. Store independent receipts in durable setup records; changing Page/operator/model/tool/mission/sample inputs invalidates affected gates. Doctor reads receipts only. Connections expire after seven days by default; immutable local samples invalidate by changed inputs rather than wall-clock alone.

## External outcome journal

Persist intent before network mutation: operation ID, destination identity, selected artifact hash, phase, request fingerprint, attempt number, remote IDs, last confirmed state and uncertainty. Replaying a confirmed operation returns the stored result. After a crash with no remote ID, use documented authoritative reconciliation or hold unknown. No guessed absence, exactly-once claim or blind duplicate submission.

Telegram polling requires a durable received-update queue before remote offset advancement, followed by application command dedupe and processed/ignored records. Long polling must not block the production/publication worker. Track message/file components separately for partially delivered notifications.
