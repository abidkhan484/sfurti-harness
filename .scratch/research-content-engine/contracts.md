# Implementation contracts

Status: ready-for-agent

## C1. Conventions and files

All new runtime code uses TypeScript modules under src/research/, src/content/ or src/adapters/; extend app.ts/config.ts/store.ts/service.ts/planning.ts/production.ts narrowly. Existing legacy types may remain; new boundaries use unknown plus runtime validators, not unchecked any.
Create src/research/contracts.ts and src/research/schemas.ts first. Every persisted record has id, schemaVersion:1, createdAt and updatedAt (UTC ISO strings). IDs are opaque strings. Revisioned IDs are immutable; revision is a positive integer and previousVersionId is optional. Status/audit transitions are append-recorded in research_events.
Large normalized text is stored under data/research/documents/<sha256>/; paths are generated internally. Locator offsets refer to immutable normalized text, in JavaScript UTF-16 offsets; end is exclusive. PDF locators also carry 1-based page. All hashes SHA-256 hex.
New collections below are JSON tables via Store; migrations are additive, transactional and versioned. Add targeted repository queries/indexes for due jobs, current statuses and dependency lookup; do not scan every document per request.
All arrays have schema-enforced bounds matching configuration. Invalid outputs produce classified errors and leave previous committed states intact.

## C2. Records (fields beyond C1 envelope)

| Record / collection                      | Required fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TriageSource / triage_sources            | canonicalOrigin, kind:web\|scholarly\|feed\|discussion\|expert, access:public\|authenticated, collectionState:candidate\|enabled\|blocked\|authentication_required, quality:unassessed\|institutional_guidance\|evidence_publication\|expert_commentary\|audience_discussion\|other, rationale, firstDiscoveredQueryId, lastCheckedAt:null-or-date, policyVersion, optional profileRef                                                                                                                          |
| SearchRun / research_search_runs         | purpose:exploration\|follow_up\|refresh\|feedback, bucket, queries:[{id,text,language,intent:neutral\|counter_evidence\|practical,provider}], status:planned\|running\|complete\|partial\|deferred, cursorByQuery, counts, dueAt                                                                                                                                                                                                                                                                                |
| SearchMatch / research_search_matches    | queryId, canonicalUrl, provider, rank, retrievedAt, title, snippet, documentVersionId:null-or-id; unique queryId+provider+canonicalUrl                                                                                                                                                                                                                                                                                                                                                                          |
| DocumentVersion / research_documents     | sourceId, canonicalUrl, originalUrl, contentHash, normalizedTextPath, title, authorNames, originalLanguage, publishedAt:null-or-date, fetchedAt, contentType, accessLevel:full_text\|abstract\|partial, extraction:complete\|partial\|failed, rights:{retentionAllowed,attribution,expiresAt}, doi:null-or-string, providerId:null-or-string, previousVersionId:null-or-id, integrity:active\|changed\|retracted\|unavailable, lastCheckedAt                                                                    |
| TriageItem / triage_items                | documentVersionId, kind:audience_signal\|expert_opinion\|evidence_candidate\|irrelevant, excerptLocator, redactedText, language, region:null-or-string, ageRange:null-or-{min,max}, question:null-or-string, classificationReason, status:new\|classified\|linked\|discarded, topicId:null-or-id                                                                                                                                                                                                                |
| ResearchTopic / research_topics          | question, bucket, ageRange:null-or-{min,max}, populationContext, exposure, comparison, outcome, triageItemIds, status:queued\|researching\|validated\|deferred\|rejected, priorityComponents, priorityScore, nextReviewAt, synthesisVersionId:null-or-id                                                                                                                                                                                                                                                        |
| Finding / research_findings              | documentVersionId, locator:{start,end,page?,section?}, originalExcerpt, workingTranslation, language, studyDesign, population, exposure, comparison, outcome, result, effectSize:null-or-string, uncertainty:null-or-string, limitations, funding:null-or-string, causalSupport:boolean, overlapGroup:null-or-string                                                                                                                                                                                            |
| SynthesisVersion / research_syntheses    | topicId, revision, findingIds, searchesRunIds, excluded:[{documentVersionId,reason}], conflicts:[{findingIds,reason,resolution:unresolved\|wording_corrected\|context_difference\|qualified}], reconciliationPasses:0\|1, limitations, status:draft\|reviewed\|superseded, reviewedAt:null-or-date                                                                                                                                                                                                              |
| ClaimVersion / research_claims           | topicId, synthesisVersionId, revision, kind:evidence\|interpretation\|hypothesis\|business_opinion, wordingBn, allowedParaphraseRules, forbiddenOverstatements, findingIds, parentClaimIds, scope:{ages,region,context}, certainty:high\|moderate\|low\|very_low\|not_assessed, certaintyReasons, status:draft\|approved\|qualified\|deferred\|rejected\|expired\|withdrawn\|superseded, reviewId:null-or-id, validUntil:null-or-date, lastCheckedAt:null-or-date, missionRelevance, attribution:null-or-string |
| EvidenceReview / evidence_reviews        | claimVersionIds, operation:evidence_review, producerTaskId, reviewerTaskId, reviewerIdentity, sourceChecks:[{findingId,locatorVerified,supportsWording,limitationsPreserved}], decision:approve\|qualify\|revise\|defer\|reject, findings:[{code,severity:low\|medium\|critical,location,reason,correction}], policyVersion, providerMetadata                                                                                                                                                                   |
| ContentBrief / content_briefs            | topicId, synthesisVersionId, claimVersionIds, kind:text\|image\|video, angle, intendedTakeaway, action:{textBn,basis:guidance\|evidence\|suggestion}, ageSegment, fingerprint, status:draft\|ready\|used\|held                                                                                                                                                                                                                                                                                                  |
| ContentDependency / content_dependencies | claimVersionId, briefId, artifactId:null-or-id, postId:null-or-id; unique IDs across applicable fields                                                                                                                                                                                                                                                                                                                                                                                                          |
| MemoryJob / memory_jobs                  | entityType, entityVersionId, dataset, operation:upsert\|remove, status:pending\|running\|ready\|failed, idempotencyKey, leaseOwner:null-or-id, leaseUntil:null-or-date, attempts, nextRunAt, remoteIds, error:null-or-string                                                                                                                                                                                                                                                                                    |
| FeedbackItem / feedback_items            | platform, remoteItemId, postId, collectedAt, kind:question\|misunderstanding\|activity_report\|other, redactedText, metrics:null-or-object, topicId:null-or-id, triageItemId:null-or-id, observation:true                                                                                                                                                                                                                                                                                                       |
| ResearchEvent / research_events          | entityType, entityId, fromState:null-or-string, toState, reason, actorTaskId, policyVersion                                                                                                                                                                                                                                                                                                                                                                                                                     |
| CorrectionCase / correction_cases        | claimVersionId, affectedPostIds, severity:low\|medium\|critical, reason, status:open\|contained\|resolved, remoteActions:[{postId,action,state,remoteId}], notificationId:null-or-id                                                                                                                                                                                                                                                                                                                            |

PolicyVersion, missionVersion and producer/reviewer model/task metadata are additionally recorded in each synthesis, claim review and artifact version. Optional fields have explicit null when unknown; unavailable data is not inferred.

## C3. Artifact extension and strict eligibility

Artifact adds mode:legacy_clip\|original_explainer\|original_text\|original_image, briefId, claimVersionIds, evidencePolicyVersion, scientificReviewState:unassessed\|passed\|held, contentFingerprint.
Version adds scriptBn, spokenScriptBn (video), sceneManifestPath, audioIntegrity, renderedTextEvidence, assetProvenance[], claimLocations:[{claimVersionId,location}], review evidence and citations caption.
Mode defaults only for old persisted records: video -> legacy_clip; other old records remain scientificReviewState unassessed. Do not mark them evidence-reviewed merely through migration.
Legacy sourceIds/segments and permission invariants remain mandatory for legacy_clip. Original media may have empty sourceIds/segments; assetProvenance still covers fonts/images/music/voice.
A factual claim includes headline/overlay/caption implications, not only sentences manually annotated by the generator. Reviewer identifies uncovered claims.
Eligibility is evaluated at generation, approval, allocation and external submission using immutable version IDs and current ledger status. Evidence-mode scheduling requires:

- artifact integrity unchanged; successful independent final review for this exact artifact version and policy;
- every dependency approved or qualified, reviewed, in-scope and valid at evaluation/publication time;
- every underlying source version intact, not retracted, and sufficiently checked; resolved locators;
- no critical hold; required reuse/attribution conditions satisfied;
- public hypotheses explicitly allowed only as non-assertive questions by review; business_opinion identified as Sfurti's view; activity suggestions contain no unsupported benefit.
  Before remote submission lastCheckedAt must be within seven days. Planned dates beyond validUntil are provisional and excluded from verified coverage. New future allocations use ready stock only when evidence covers that date.

## C4. Agent contracts

Search.plan({mission,buckets,questions,feedbackSummaries,priorQueries,limits}) -> {queries:[{text,language,intent,reason}], nextQuestions:[]}.
Validator.extract({documentVersion,normalizedText,mission}) -> {items:[TriageItem draft], findings:[Finding draft]}; app generates IDs and verifies excerpts/locators.
Validator.synthesize({topic,findings,searchCoverage,exclusions,mission,reconciliationPasses}) -> {claims:[Claim draft],conflicts,limitations,decision:ready\|defer\|reject}.
Reviewer.evidence({claims,findings,sourceExcerpts,sourceMetadata,policy,mission}) -> EvidenceReview draft. Never receives validator chain-of-thought/history.
Generator.briefs({topic,approvedPacket,history,desiredKinds,maxBriefs}) -> {briefs:[ContentBrief draft]}.
Generator.content({brief,approvedPacket,template,previousFindings?}) -> {captionBn,bodyBn?,scriptBn?,scenes?,claimLocations,assetRequests}. All text fields bounded; no arbitrary HTML/JS/shell.
Reviewer.content({artifactVersion,actualMediaEvidence,approvedPacket,policy,mission}) -> existing Review plus sourceChecks, uncoveredClaims, severity and reviewerIdentity.
All roles run through TaskModelRouter, task types search/topic-validation/generation/review. Isolated reviewer requests do not inherit generator sessions. Input includes canonical IDs and excerpts, not raw credentials or unsanitized HTML. Reviewer cannot update source facts; it requests a new validator revision.

## C5. Adapter boundaries

All adapter operations accept signal:AbortSignal, have bounded outputs, and return typed results or AdapterError. Inject HTTP transport/clock for offline tests.
Search.search({query,language,cursor?,limit}) -> {hits:[{url,title,snippet,publishedAt:null-or-date,providerId?}],nextCursor:null-or-string,coverage:{partial:boolean,reason?}}.
Collector.fetch({url,sourceId,previousEtag?,previousModified?}) -> {status:ok\|not_modified\|blocked\|authentication_required\|unavailable, finalUrl, bytes?, mime?, etag?, lastModified?, fetchedAt, reason?}.
Extractor.extract({bytes,mime,url}) -> {text,language,locators,coverage:complete\|partial,metadata}. Never fake full-text access.
Memory.upsert({dataset,entityVersionId,text,metadata,idempotencyKey}) -> {jobId,state:pending\|ready}; Memory.status(jobId) -> {state:pending\|ready\|failed,remoteIds}; Memory.search({datasets,query,limit}) -> {hits:[{entityVersionId,documentVersionId?,locator?,score}],partial:boolean}; Memory.remove({entityVersionId,remoteIds,idempotencyKey}) -> {state:pending\|ready}; Memory.health() -> capabilities/version.
Cognee mapping is implementation-version-specific, captured and tested in docs/integrations/research-providers.md. A hit without resolvable provenance is excluded, including a generated answer with no IDs.
Tts.synthesize({textBn,voiceId,outputDirectory}) -> {wavPath,seconds,sampleRate,voiceHash,configHash}.
Renderer.render({kind,scenes,audioPaths,fontPath,outputDirectory}) -> {filePath,sceneManifestPath,assetProvenance}.
Inspector.inspect({artifactPath,kind,expectedScriptBn}) -> {valid,metadata,frames,ocrText,asrTranscript,audioMeasurements,coverage,limitations}; expectedScriptBn may be used for comparison but never returned as if it were independent ASR.
Feedback.collect({pageId,postRemoteIds,cursor?}) -> {items,metrics,nextCursor,unavailableFields}.
Reuse Facebook bounds/submit/reconcile/cancel wrapper shape. Add built-in implementation and inject transport. Config selects built-in or process adapter, never both for one operation.

## C6. App commands and proposed CLI

All commands return {status,ids?,counts?,reason?,nextRunAt?}; list/show commands return bounded {items,nextCursor}. They run through existing createHarness.execute.

- research-plan {purpose?,topicId?}; research-search {searchRunId}; research-fetch {url,sourceId?}; research-extract {documentVersionId}
- research-triage {documentVersionId}; research-topics {cursor?,limit?}; research-topic {topicId}; research-validate {topicId}
- research-review {claimVersionIds}; research-refresh {claimVersionId?}; research-withdraw {claimVersionId,reason,severity}
- memory-sync {limit?}; memory-search {query,datasets?,limit?}; research-briefs {topicId,kinds?}
- produce-from-brief {briefId,origin:daily\|custom}; feedback-collect {postId?}; research-cycle {dryRun?}
- research-export {directory}; research-status {}; research-legacy-audit {artifactIds?,preview:boolean}
  Existing doctor, backup, status, plan, publish, reconcile, service-cycle remain public.
  CLI maps to these as: research plan/search/fetch/extract/triage/topics/topic/validate/review/refresh/withdraw/briefs/status/export/legacy-audit; memory sync/search; produce-brief; feedback collect.
  research enable is a config edit, not an implicit side effect of any list/show command.
  dryRun plans due work only; no network, LLM, media, publication or mutation. Tests may pass an injected fake adapter for actual execution.

## C7. State transitions and recovery

Task lifecycle uses existing tasks with kind namespace research:*: queued -> running -> complete; transient failure -> deferred with nextRunAt; invalid evidence -> rejected/deferred editorial result; authentication -> authentication_required connector state. Reserve lease/attempt atomically before external call and commit only if owner still matches.
Editorial attempts are separate from transport attempts and quota deferrals. Conflict budget is per synthesis revision; automatic retries cannot mint a new revision to reset it. New evidence hash or explicit topic revision permits a fresh synthesis.
Approval transition and ContentDependency writes are transactional. Claim status invalidation and corresponding hold events are transactional. Memory outbox is created in the same commit as its source record.
Retries after timeout use operation/entity IDs to inspect existing completion; never blindly repeat an uncertain remote post. Persistent failure in one connector must not pause unrelated eligible jobs.
New claim version is draft. Old version remains immutable; if evidence was invalidated it is held/withdrawn immediately, not kept approved pending replacement.

## C8. Ranking and cadence algorithm

Topic priority is 0..100: relevance (0..30), actionable parent need (0..25), evidence gap (0..20), recurrence among distinct redacted observations (0..15), freshness (0..10). Validator supplies bounded components and reasons; app computes sum. Critical correction work bypasses ordinary queue.
Evidence strength controls wording/eligibility, not popularity ranking. Repeated copies do not increase recurrence. Record population/context differences before clustering.
A research cycle reserves budget for exploration/follow_up/refresh/feedback in 40/30/20/10 proportions of query slots. Unused shares are borrowed in that order, with at least one exploration and one counter-evidence query when >=2 queries are available.
Due jobs sort by critical-containment first, upcoming-post expiry next, then priority desc, createdAt asc, id asc. Claim refresh does not change original publication dates.
Normalize DOI and URL deduplication deterministically: lowercase scheme/host, strip fragment/default ports and known tracking params, sort remaining query params; retain semantically meaningful params/path and source identity. Equal content hash creates one blob but multiple provenance matches.
Do not count two reports of the same study as independent replication; preserve overlapGroup and common DOI.

## C9. Rolling publication mix (business default)

Weights text=.10, image=.25, video=.65; totalPostsPerDay=5; mixWindow=20. Custom posts excluded from default mix and daily completion.
Serialize allocation using planner lease. History is the last 19 confirmed published default-origin posts preceding the allocation plus active default-origin queued/scheduled allocations in chronological order when planning forward; use a virtual sequence per scheduling run, retaining only the latest 19 before each next draw.
For each eligible kind k compute deficit = weight[k]*(historyLength+1) - count[k]. Choose maximum deficit; tie order video,image,text; append the reserved kind to virtual history. Persist reservation before continuing. Cancelled/failed allocations drop from future projections; confirmed history never changes. When a lower-deficit eligible kind substitutes for missing stock, record reason and deviation; if none eligible, record shortage.
This is a rolling target, not a guarantee that every sliding 20-post segment has exact counts after failures/substitutions. With all kinds continuously available, empty history yields 2 text,5 image,13 video in the first 20 allocations. Ratio tests cover long sequences and restart determinism.
A maximum 2 briefs from the same topic per day prevents one synthesis dominating a package. Distinct-source rule applies only to legacy clips, not evidence documents or original explainers.
Daily snapshots seal total and mix; future unconfirmed plans can rebuild. Exact config.topic equality is replaced in evidence mode by validated mission-relevant topic IDs; topic string filtering remains in legacy mode.
Coverage counts actual assigned eligible items against total slots; additionally reports mix deviation, evidence expiry and provisional future content. Future local plans are not Facebook-confirmed schedules.

## C10. References and version verification

Checked 2026-09-09; adapters must pin their tested versions and document any incompatible current API changes.

- SearXNG /search supports q and format=json; JSON must be enabled on the configured instance: https://docs.searxng.org/dev/search_api.html
- Europe PMC search supports query and format=json; scholarly search may return abstracts rather than full text: https://europepmc.org/RestfulWebService
- Cognee current memory and HTTP interfaces: https://docs.cognee.ai/core-concepts/main-operations/remember and https://docs.cognee.ai/api-reference/introduction
- Piper voice files/card: https://huggingface.co/rhasspy/piper-voices/tree/main/bn/bn_BD/google/medium
- Browser session storage: https://playwright.dev/docs/auth
- Evidence certainty domains: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-14
- Meta Pages/Reels: https://developers.facebook.com/docs/pages-api/posts/ and https://developers.facebook.com/docs/video-api/guides/reels-publishing/ (not fetched successfully during design; ticket requires live documentation/schema verification before implementation pin).

## C11. Approval and source-access decision table

This table supplements C3 and makes low-confidence behavior deterministic. App code enforces the decision even when an agent returns approve.

| Input                                                                                       | Required disposition                                                                                                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Public search result only                                                                   | Discovery candidate; never a publishable finding                                                                              |
| Public fetched document, supported type, collector policy passes                            | Source may become enabled for collection; quality remains separately assessed                                                 |
| Login wall, disabled collection policy, unsupported extraction or unresolved private target | Skip/defer this source with reason; continue other sources                                                                    |
| Parent report                                                                               | Audience signal; anonymize and use for questions, not scientific claims                                                       |
| Expert identity/credentials unverified                                                      | Unverified commentary; cannot claim expert endorsement                                                                        |
| Relevant expert credentials verified with supporting profile/affiliation references         | Expert opinion; factual assertions still require source-backed validation                                                     |
| Study abstract only                                                                         | Discovery/follow-up input; do not approve developmental claims whose methods, results or limits require unavailable full text |
| Accessible institutional guidance                                                           | May support accurately attributed guidance after identity, date, scope and cited context checks                               |
| Suitable accessible primary study or synthesis                                              | May support scoped findings after independent review; publication type alone does not establish certainty                     |
| Low/very-low certainty or genuine unresolved disagreement                                   | Qualified explanation of uncertainty may pass; causal/prescriptive overstatement fails                                        |
| Fabricated locator, wrong excerpt, retraction, shared producer/reviewer context             | Reject current approval regardless of model verdict                                                                           |
| Business opinion with no scientific assertion                                               | No scientific finding required; Sfurti attribution and independent editorial review required; certainty not_assessed          |
| Interpretation                                                                              | At least one eligible parent evidence claim plus explicit inference wording; cannot exceed parent scope                       |
| Hypothesis                                                                                  | Internal by default; review may approve only an explicitly exploratory question with no unsupported asserted premise          |

Every approved or qualified public claim, including editorial opinions/questions, has a non-null reviewId, validUntil and lastCheckedAt. For non-evidence claims use the configured 30-day editorial review interval; original source checks apply to evidence-bearing dependencies. Metadata unknowns remain null in drafts and never silently become current dates or verified credentials.
Expert verification references belong in the source assessment rationale/evidence metadata and must resolve to archived public passages; collecting unnecessary personal identifiers is not required.
Evidence-mode nonfactual activities still require an explicitly reviewed business_opinion or interpretation/suggestion brief basis, so an empty claim list cannot bypass review by asserting the whole post has no claims.

## C12. Work budgets and calibration

Each expensive job reserves one workload unit before calling a provider. A document extraction that invokes an LLM counts as a provider task. Concurrent jobs reserve atomically and may not exceed the combined existing daily limit. Cheap deterministic parsing is bounded by document/time/size limits rather than LLM allowance.
Unknown dollar costs are reported unknown; initial implementation enforces query/document/token-or-task caps without requiring a billing API. A missing provider token counter uses the stricter task cap, not unlimited execution. Browser and media tasks have their own time/size caps as well as worker limits.
Version-pinned service/voice/parser records are configuration data. Their exact release numbers are determined by the responsible integration ticket's verified docs and local compatibility test, then committed in deployment/examples/lock metadata. An implementer must not use a floating latest tag or claim an untested version is production-ready.
The default rolling publication mix is a business instruction. Evaluation of parent outcomes and content utility may suggest a future change, but the engine must not autonomously alter these weights or mission policy based on engagement.
