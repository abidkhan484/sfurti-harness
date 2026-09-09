# Sfurti Research → Content Engine MVP

Status: ready-for-agent
Implementation: not started by this document
Approved direction: conversation through 2026-09-09; runtime baseline 55b5fd4.
Owner: Sfurti operator. Audience: Bangladeshi parents; children ages 3–15.

## How to use this package

Start with [README](README.md), then implement exactly one unblocked ticket.
[Contracts](contracts.md) owns field names, states, adapter boundaries and scheduling rules.
[Acceptance scenarios](acceptance.md) owns cross-stage completion checks.
[Gap assessment](gap-assessment.md) distinguishes current implementation from proposed work.
The former docs/spec.md target was absent at assessment time; this feature specification is not a reconstruction of that missing original spec.

## S1. Outcome and mission

Continuously discover parent questions and existing credible evidence from across the internet, assess them, create original Bangla educational content, independently review it, publish to Sfurti's Facebook Page, and feed audience questions back into research.

Sfurti invites meaningful effort, curiosity, creativity, problem-solving and real-world engagement while preserving child agency. It is physical-first, not anti-technology, and not defined by wooden toys. Research may support beneficial, neutral, conditional, adverse or inconclusive findings about digital activity. Mission relevance controls editorial selection; it never determines whether a finding is true.

Preserve existing docs/mission.md. The mission reference supplied by the user is ../sfurti/skills/sfurti-business-mission/SKILL.md; this package is self-contained if that sibling is absent. Do not require its path at runtime.

## S2. Scope and defaults

Required: internet-wide keyword discovery; web and scholarly search; HTML/PDF/feed ingestion; optional configured authenticated browser collection; typed audience/evidence intake; independent AI roles; claim provenance; Cognee; original text/images/video; Piper bn_BD; automated review; Facebook delivery; feedback; refresh; corrections; bounded critical escalation.
Internet-wide means no Facebook-only, Bangladesh-only, Bangla-only or fixed-site discovery restriction. Supported connectors are bounded; inaccessible pages remain explicitly unavailable.
Publishing is Facebook Page only in this MVP. Reading personal-account content is optional and separate from Page publishing.
No personalized diagnosis, treatment decisions, original scientific experimentation, universal site scraper, product-sales engine, new dashboard, or automatic copying of external media.
One source can support multiple claims; a synthesis can support multiple briefs; a brief can use multiple sources. Do not equate one scraped page with one post.

Implementation defaults below are operational choices, configurable without changing mission:

- Research off in existing configs until explicitly enabled; productionMode remains legacy until evidence mode is activated.
- New evidence-mode example uses five total posts/day, preserving the previous total; publication mix is 10% text, 25% image, 65% video by post count.
- Asia/Dhaka; existing daily trigger times and age range retained; evidence-mode discovery query defaults bn/en but intake accepts every detected language, with no region filter.
- Daily discovery, daily source-change checks for claims linked to upcoming posts, weekly broader evidence search, monthly review of active claim packets; urgent correction/retraction signals immediate.
- High/moderate-certainty evidence claims expire after 90 days; low/very-low or conflicted claims after 30 days. All need a last-checked age <=7 days at actual external submission. These are editorial defaults, not scientific guarantees.
- 12 queries/run, 10 results/query, 50 new documents/day, 2 requests/host/minute, 2 concurrent fetches, 15 MB/document, 30 s HTTP timeout, 1 browser context, 20 browser pages/day, 3 briefs/topic/revision.
- Global existing LLM daily/tick limits still apply; count research calls too. Stop new expensive work when limits exhaust. Unknown provider monetary usage is reported unknown, never zero.
- Scripted generation is limited to initial artifact plus two corrections; conflicting evidence gets exactly one reconciliation pass, separately counted.
- Existing 90-day reserve remains a planning target; approved future artifacts whose evidence expires before use do not count as verified coverage. Show provisional reserve separately. Never weaken freshness to achieve reserve targets.

## S3. End-to-end lifecycle

1. Search Agent proposes bounded neutral, question-oriented and counter-evidence queries from the five buckets: Attention & Focus; Behavior & Emotion; Learning & Creativity; Physical / Real-world Life; Solutions & Alternatives.
2. Search connectors find URLs. Collectors fetch content. Extraction preserves locators and languages, removes identifying audience details, and checks extraction completeness.
3. Triage items are typed audience_signal, expert_opinion, evidence_candidate or irrelevant. Registry entries are discovered automatically; source quality and access decisions carry reasons and can be revised.
4. Topic Validator clusters related items, creates age/context-specific questions and searches existing research to answer them. Full source access is required for the claim being assessed; a search snippet is never sufficient scientific support.
5. Validator builds a synthesis and candidate claims with supporting and contrary findings. A separate evidence-review run under the reviewer role checks citations and reasoning.
6. Approved claim packets are indexed in Cognee. Retrieval resolves returned IDs against authoritative current records before any generation.
7. Content Generator produces distinct briefs and Bangla artifacts from approved packets. It can suggest accessible physical activities without claiming that an untested activity produces a measured benefit.
8. Content Reviewer inspects actual rendered text, imagery, audio, captions and sources in an independent context. Deterministic gates enforce its structured decision and dependency integrity.
9. Planner allocates eligible artifacts by rolling mix. Publisher rechecks evidence immediately before external submission, then reconciles remote status.
10. Feedback is collected and anonymized, linked to posts/topics and used as new audience signals. Engagement is not evidence of developmental benefit.
11. Source refresh, expiry, contradictions and retractions invalidate dependencies and trigger bounded re-evaluation.

Source pages, retrieved memory and audience feedback are untrusted data. Agents receive them as quoted inputs, never instructions or permission to run commands. Search/validator agents do not have publishing credentials or tools.

## S4. Roles and independence

Four logical roles: search, topic-validation, generation, review. Evidence-review and final-content-review are distinct operations of review.
Use existing TaskModelRouter with added search and topic-validation assignments. Same model is allowed for different roles, but each uses a separate task/session; no generator history or self-approval enters the reviewer context.
Every AI output is runtime-validated structured data. Every review records model/provider, task ID, session identity when available, policy/mission versions and inspected references. Isolation must be demonstrated by adapter capability when a provider lacks session IDs; missing identity is not proof of independence.
Human review is only a critical exception. Medium issues are corrected, deferred or rejected automatically. Exhausted retries, missing optional sources and routine ambiguity do not escalate.
Critical means potentially harmful published advice, a consequential factual error already published, private-data exposure, compromised account/source integrity, or inability to contain an affected remote publication. Policy decision reasons must be inspectable; an LLM cannot waive hard gates.

## S5. Evidence policy

Source search preference: relevant systematic reviews/meta-analyses and authoritative guidance, then suitable primary studies, then attributable expert explanations. Blogs/social discussions identify questions and citations; author reputation alone is not verification.
Appraise each relevant finding: study design, population/age/country, exposure/intervention, comparison, outcome, effect and uncertainty if reported, measurement method, confounding, date, funding/conflicts, overlap with other studies, limitations and direct applicability.
Guidance is labeled guidance; an observational association is not causation; a proposed mechanism is not a measured outcome. Assess source method and claim relevance separately from prestige.
Certainty is high/moderate/low/very_low/not_assessed with written justification across bias, consistency, indirectness, imprecision and publication-bias concerns. This is a Sfurti editorial rubric informed by GRADE domains, not a claim of formal GRADE certification.
One reconciliation pass checks translation, age/context, measures, dates and actual disagreement. Correct extraction errors with an audit record. If genuine conflict persists, qualify the claim or defer it. Never choose the mission-favorable side as truth.
Evidence, interpretation, hypothesis and business_opinion remain separate. Hypotheses are internal by default; public exploratory questions cannot imply their premise is true. Interpretation must reference evidence and retain qualifications. Business opinions must be attributed to Sfurti. Unsupported developmental claims cannot be relabeled opinion to pass.
An expert comment requires verified identity and relevant expertise, is initially expert_opinion, and requires supporting evidence/guidance for factual promotion. A parent's report proves only that the report was made.
Every public factual claim has exact approved Bangla wording or permitted paraphrase constraints, source locators, population/scope, prohibited overstatements, expiry and review records. Inconclusive results can be communicated explicitly.

## S6. Collection and memory

MVP concrete integrations: operator-controlled SearXNG JSON search for general discovery; Europe PMC for scholarly metadata/open-access evidence; HTTP HTML/PDF and RSS/Atom collectors; optional Playwright browser connector. These choices avoid requiring a paid search subscription. Search quality and upstream availability must be measured, not assumed.
Registry starts empty. Agent-discovered domains enter candidate state, then automatic access and source-quality classification. Optional operator seed URLs are supported but never required.
A configured authenticated browser profile may read only enabled origins using a user-established session. Login/checkpoints yield authentication_required. Personal access does not automatically establish collection permission. No credential guessing, challenge bypass, anti-detection system or account cycling is in scope.
Redact audience names, handles, contacts, identifiers and sensitive child details before persistent AI memory. Keep content permalink only when appropriate under retention/access policy; do not archive raw private discussions as scientific material.
Use URL normalization, content hashes and DOI/provider IDs to deduplicate; preserve many query-to-result matches. Distinguish syndicated copies from independent evidence.
Cognee is a replaceable service behind a typed adapter. Use a pinned, tested release and documented API mapping. Keep source/claim versions, approvals, dependencies and tombstones in harness SQLite; Cognee is a rebuildable retrieval index.
Separate audience, evidence, approved-claim and editorial-history datasets. Generated content/agent session improvements cannot silently enter verified evidence. Disable unreviewed automatic promotion.
Prefer retrieved chunks/IDs over synthesized memory answers. Fetch archived excerpts and current ledger records to create the evidence packet. If provenance cannot be resolved, omit the hit.
Version changes update the ledger immediately, then enqueue memory synchronization. Indexing failure never erases evidence and never marks unsynchronized data ready.
Retention defaults: anonymized audience items 180 days; approved claim lineage retained while content depends on it; permitted public snapshots 365 days or their stricter source policy. Cleanup is preview-first and verifies lineage and backup readability; retain necessary permitted excerpts/tombstones, not identifiers.

## S7. Production and publication

Keep legacy licensed-clip mode. Add original_explainer mode that has no required external video source/segments; owned/licensed visuals retain asset provenance. Scientific citations and media-reuse permissions are different records.
Piper is the planned Bangla TTS provider. Pin exact bn_BD voice, ONNX/config hashes and model card; use configured local executable with argument arrays, not shell text. Normalize numbers/abbreviations; preserve original and spoken scripts. Voice rights and intelligibility are setup checks, not reasons to silently substitute a different language/provider.
Default original video is vertical 1080x1920, 30–60 seconds, H.264/AAC MP4. Use deterministic scenes rendered with a Bangla-capable local font, Piper narration and FFmpeg composition. Avoid requiring a paid generative-video service.
Image output is 1080x1080 PNG with Bangla text rendered by a browser/template engine, not entrusted to image-generation spelling.
Final inspection uses actual image frames, OCR or equivalent rendered-text extraction, media metadata, measured audio, independent ASR and timed transcript comparison. ASR disagreement triggers correction or deferral, not a claim of complete listening. Reviewer records coverage and limitations.
Public captions contain concise source attribution/links for factual claims. Traceability applies to hook, overlay, narration, caption and practical advice; accessible links are attached to the post caption, not only an internal record.
Approved content schedules automatically after evidence-mode activation and successful platform setup. Spec creation/implementation alone does not authorize a live post. Actual live smoke requires an explicit operator command.
Facebook integration must implement real text/photo/Reel submission and remote reconciliation, not only wrappers/mocks. Poll upload processing states; do not equate upload with publication. Unsupported future scheduling uses local due-time dispatch.
No personalized advice is generated in comments; feedback collection does not post replies.

## S8. Operations, updates and failures

Expose commands defined in contracts.md through createHarness.execute and CLI; service-cycle schedules independent research, memory, production, publication, feedback, refresh and notification phases.
Reuse durable tasks, leases and provider quota deferral; external calls stay outside SQLite transactions. Persist checkpoints, provider/model choices and idempotency keys. A quota deferral does not consume editorial or conflict iterations.
Claim expiry/withdrawal immediately blocks new use; local plans become held. Already remote-scheduled posts get a cancellation request and reconciliation. Uncertain cancellation stays unresolved; do not report successful prevention.
Already published affected posts retain remote IDs and create a correction case. Critical cases notify a human; noncritical correction drafts go through the same independent review. Remote edits/removals require a recorded policy/explicit command; never silently erase publication history.
Source outages preserve last-known evidence but cannot advance lastCheckedAt. After freshness limits, use is held. New material evidence creates a candidate revision; old approvals never transfer automatically.
Feedback polling after 24 h, 72 h and 7 d captures available counts, questions, misunderstandings and reported activity attempts. Missing metrics remain null. Counts/reports are observational and self-selected.
Backups include ledger, referenced evidence/media, policies/config sans secrets, and a manifest/checksums. Restore verifies references; Cognee can be rebuilt.
Provide a read-only doctor with separate configured, locally_tested and live_verified results. A working fixture is not proof of account permission, current API behavior, voice suitability or live delivery.

## S9. Completion

Implementation complete means all ticket acceptance checks and offline end-to-end scenarios pass with no regressions in legacy behavior.
Operationally ready additionally requires configured services, credentials, pinned voice/tools, multilingual/claim review evaluation and an operator-triggered end-to-end live sample. Report these separately.
Business success is measured separately: useful parent questions answered, comprehension, reported activity attempts and recurring questions; reach and video views are distribution metrics, not proven child outcomes.
