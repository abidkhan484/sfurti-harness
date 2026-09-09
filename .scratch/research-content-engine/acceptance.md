# End-to-end acceptance scenarios

Status: ready-for-agent

Use isolated temporary databases, fake clock, controlled transports and explicit synthetic fixtures for deterministic tests. These assertions are minimum acceptance behavior; implementation tickets add focused tests.

## Fixture corpus

Create small text/HTML/PDF/feed fixtures under test/fixtures/research. Every fixture says SYNTHETIC TEST DATA and has a stable content hash and locator.

- parent-boredom-bn: anonymized parent asks why a child gets bored without a phone.
- observational-study-en: ages 6–9, association only, reported confounders, no causation.
- conflicting-study-en: comparable outcome with different result; disagreement is real.
- contextual-study-other-language: translated age/context qualifier changes interpretation; original excerpt retained.
- institution-guidance: attributable guidance and age scope.
- expert-comment: identifiable fictional expert assertion with no supporting study.
- malicious-page: instructions to override policy/publish and a metadata-service URL.
- changed-source/retraction-notice: new content invalidating one previously approved claim.
- images/audio: Bangla PNGs with a changed number, silent WAV/video and a short audible narration.
  Fixtures represent scenarios, not real scientific findings. Live example sources are stored separately and reviewed normally.

## A1. Zero-seed internet discovery

Given no TriageSources and enabled web/scholarly adapters, research-plan generates bounded neutral/counter-evidence queries. Search discovers at least two origins and one scholarly record. Extraction yields typed triage items and source references. No Facebook/personal-account input is required.

## A2. Audience and expert separation

A parent statement and an expert assertion are ingested. Neither becomes approved scientific support without verification. Expert attribution is retained; audience identifiers are redacted. A later cited verified finding can support a new claim revision without rewriting the original comment into evidence.

## A3. Balanced evidence and conflict cap

Validator sees observational and contrary studies. It preserves association wording, age/context, missing fields and overlap. Exactly one reconciliation pass runs. Genuine disagreement remains qualified/deferred. A translation mistake is corrected only with original-source evidence. Restart does not reset the cap.

## A4. Claim approval integrity

Independent reviewer receives original excerpts and their context. Fabricated quote, wrong locator, source retraction, missing reviewer isolation, absent scope or expired evidence blocks approval despite model decision approve. Valid qualified wording can pass with explicit limitations and expiry.

## A5. Cognee memory lifecycle

Persist and index audience/evidence/claim records in separate datasets. An asynchronous indexing job is not ready until confirmed. Crash after remote completion recovers. A stale high-scoring withdrawn hit is excluded by ledger checks. Generated session summaries cannot promote themselves into approved claims.

## A6. Multiple content briefs

One accepted synthesis yields distinct brief angles, up to configured limit. At least three useful fixture briefs exercise text/image/video; the system may emit fewer for real topics. All reference exact claim revisions. No duplicate hook or untested activity efficacy is introduced.

## A7. Real original media

Generate a Bangla text post, PNG and narrated original MP4. MP4 has actual Piper audio, expected codecs/dimensions and 30–60 s duration; source video IDs may be empty. Fonts/voice/assets have provenance. Captions/source attribution are present. Short synthetic fixture media can be composed for unit tests, but final opt-in sample meets full duration.

## A8. Independent final review

Reviewer reads actual OCR/frames/ASR/metadata. A changed number, dropped qualifier, silent narration or unsupported caption blocks approval. Expected script is not used as invented observed transcript. Initial render plus two corrections is the maximum; routine failure defers without human escalation.

## A9. Rolling mix and scope

With uninterrupted eligible stock, first 20 default allocations are 2 text/5 image/13 video. Custom posts do not alter default mix. Restart preserves choices; missing video creates recorded deviation/shortage without bypassing eligibility. Different validated topics allocate despite differing topic strings. Only legacy clips require distinct source videos.

## A10. Publish and reconcile

Text/photo/Reel mock HTTP responses exercise concrete request builders. Accepted upload is not published. Timeout after remote creation does not create a duplicate. Processing survives restart. Local due-time fallback does not claim remote scheduling. Invalidated claim between allocation and submission yields zero submit calls.

## A11. Feedback closes the loop

24h/72h/7d collection produces available observations, preserves null metrics and deduplicates IDs. A parent question becomes a linked triage item/topic/query in a later cycle. Engagement and reported improvement are never promoted into scientific proof. No automatic public reply is sent.

## A12. Expiry, withdrawal and critical handling

Source revision invalidates one claim used by three formats. All local dependent posts are held; remote schedules request cancellation and reconcile. Unknown cancellation stays unresolved. A consequential published error opens one critical case with actual remote IDs. Medium wording failures stay automated. Failed source fetch cannot extend freshness.

## A13. Persistence, budget and recovery

Crash after each phase, restart and assert completed phases are not repeated. Search/memory outage leaves independent eligible publication working. Quota deferral preserves role/model and counters. Midnight uses Asia/Dhaka. Backup/restore verifies hashes and dependencies; Cognee rebuild preserves claim status. Retention preview cannot remove referenced evidence.

## A14. Activation and legacy compatibility

Existing legacy tests pass with research disabled. Evidence activation holds unassessed legacy claims until audited, without altering original files/history. Doctor separates configured/local/live results and makes no network calls. Dry-run has no mutations. Real posting occurs only via explicit operator action during live sample, with returned remote status recorded.

## Release verification

Run npm run typecheck, npm run lint, npm test and git diff --check. Run formatter only on changed files. Report all results and any unrelated baseline failure explicitly.
Live evaluations are opt-in: verify configured search, Cognee indexing/deletion/provenance, actual Piper/ASR/OCR, and one authorized Page post followed by reconciliation/feedback. Record source/model/tool versions, timestamps and coverage limitations.
Zero unsafe approvals in these fixtures is a necessary release condition, not a universal factual-accuracy guarantee.
