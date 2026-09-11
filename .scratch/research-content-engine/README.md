# Research → Content Engine implementation tracker

Status: ready-for-agent
Implementation: not started
Created: 2026-09-09
Baseline reviewed: 55b5fd4

## Start here

This is the approved design translated into an implementation package, not a claim that the feature exists.
Read [gap assessment](gap-assessment.md), [spec](spec.md), [contracts](contracts.md) and [acceptance scenarios](acceptance.md).
The source-of-truth runtime project is sfurti-harness. Every path inside tickets is relative to that repository unless absolute.
The feature tracker is intentionally versionable even though other .scratch work remains ignored.

## Work protocol for a small-model implementer

1. Choose one ticket whose dependencies have completion records showing passing checks.
2. Read AGENTS.md, CONTEXT.md, the ticket, and its named contract/spec sections. Do not infer requirements from the ticket title alone.
3. Inspect listed existing files and immediate callers/tests. Proposed new filenames are suggestions for the new modules, not claims about existing code.
4. Implement the concrete behavior with the requested fixtures. Source/claim policy is enforced by code as well as prompts.
5. Run focused tests and stated shared checks; fix failures without weakening requirements.
6. Append completion evidence and remaining external prerequisites in the ticket's Comments. Keep existing changes that belong to others.
7. Stop at that ticket's defined boundary. Do not mark dependent tickets done automatically.

Existing canonical Status labels describe triage, not completion. Every initial ticket is ready-for-agent but is executable only after dependencies pass. Track implementation in its Completion record/Comments. An unavailable secret or account permission may block a live verification step without blocking fixture-based implementation.

## Dependency order

Numeric order is a valid topological order. Dependencies below are authoritative. All tickets together implement the full agreed MVP; optional browser capability is built but activation is optional.
Shared files (app.ts, config.ts, store.ts, planning.ts, production.ts, service.ts, adapters/index.ts, integration docs) require serialized merges if multiple implementers work concurrently. Independent provider modules can be developed on separate branches after contracts land.

| Ticket                                           | Work                                                                   | Depends on                                |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------- |
| [01](issues/01-research-contracts.md)            | Define research records and runtime schemas                            | —                                         |
| [02](issues/02-research-store.md)                | Add durable research storage, events and indexes                       | 1                                         |
| [03](issues/03-research-configuration.md)        | Add explicit research, content and integration configuration           | 1                                         |
| [04](issues/04-agent-role-routing.md)            | Add search and topic-validation roles with review isolation            | 1, 3                                      |
| [05](issues/05-query-planning.md)                | Generate bounded multilingual discovery and counter-evidence queries   | 2, 4                                      |
| [06](issues/06-searxng-search.md)                | Implement general web search through SearXNG                           | 1, 3                                      |
| [07](issues/07-scholarly-search.md)              | Implement Europe PMC scholarly search and source identity mapping      | 1, 3                                      |
| [08](issues/08-http-collection.md)               | Implement bounded HTTP collection and URL access checks                | 2, 3                                      |
| [09](issues/09-document-extraction.md)           | Extract HTML, PDF and feeds with stable provenance                     | 1, 8                                      |
| [10](issues/10-optional-browser-collection.md)   | Add opt-in authenticated browser collection without making it required | 3, 8, 9                                   |
| [11](issues/11-source-registry-triage.md)        | Build the discovered source registry and classify intake               | 2, 4, 5, 6, 7, 9                          |
| [12](issues/12-topic-priority.md)                | Cluster parent questions and prioritize research topics                | 11                                        |
| [13](issues/13-evidence-synthesis.md)            | Create balanced syntheses with one conflict reconciliation pass        | 7, 11, 12                                 |
| [14](issues/14-evidence-review.md)               | Independently validate and approve claim versions                      | 4, 13                                     |
| [15](issues/15-cognee-service.md)                | Package a pinned Cognee service and typed HTTP adapter                 | 1, 3                                      |
| [16](issues/16-memory-outbox.md)                 | Synchronize versioned knowledge into Cognee durably                    | 2, 14, 15                                 |
| [17](issues/17-evidence-retrieval.md)            | Resolve memory hits into current verified evidence packets             | 14, 16                                    |
| [18](issues/18-content-briefs.md)                | Generate multiple distinct briefs from each approved synthesis         | 12, 17                                    |
| [19](issues/19-bangla-content-generation.md)     | Generate structured Bangla copy, scripts and scenes                    | 4, 18                                     |
| [20](issues/20-image-scene-rendering.md)         | Render Bangla image posts and video scene frames                       | 3, 19                                     |
| [21](issues/21-piper-bangla-tts.md)              | Integrate local Piper bn_BD narration                                  | 3, 19                                     |
| [22](issues/22-original-video-composition.md)    | Compose original Bangla explainers with narration and captions         | 20, 21                                    |
| [23](issues/23-independent-media-inspection.md)  | Inspect actual rendered Bangla text and audio independently            | 20, 22                                    |
| [24](issues/24-final-content-review.md)          | Review finished artifacts against approved evidence                    | 4, 17, 19, 23                             |
| [25](issues/25-claim-publication-gate.md)        | Enforce evidence dependencies during planning and publishing           | 14, 24                                    |
| [26](issues/26-rolling-content-mix.md)           | Replace evidence-mode fixed daily quotas with rolling mix allocation   | 3, 25                                     |
| [27](issues/27-production-coordination.md)       | Connect validated briefs to durable daily and custom production        | 18, 24, 26                                |
| [28](issues/28-facebook-text-photo.md)           | Implement real Facebook Page text and image delivery                   | 3, 25                                     |
| [29](issues/29-facebook-video-reconciliation.md) | Implement Reel upload, processing and remote reconciliation            | 22, 28                                    |
| [30](issues/30-audience-feedback.md)             | Collect available Page feedback and turn it into new questions         | 11, 12, 28, 29                            |
| [31](issues/31-refresh-withdrawal.md)            | Refresh evidence and contain invalidated claims across content         | 16, 25, 29                                |
| [32](issues/32-legacy-content-audit.md)          | Import existing content into an explicit scientific-review queue       | 14, 24, 25                                |
| [33](issues/33-critical-exceptions.md)           | Route only critical editorial cases to human attention                 | 24, 31                                    |
| [34](issues/34-application-cli.md)               | Expose research, memory and feedback commands through the harness      | 5, 11, 12, 14, 17, 18, 27, 30, 31, 32, 33 |
| [35](issues/35-continuous-service.md)            | Run the complete research-content loop with durable budgets            | 16, 27, 30, 31, 33, 34                    |
| [36](issues/36-backup-retention.md)              | Back up and restore research lineage and apply retention safely        | 2, 16, 31                                 |
| [37](issues/37-end-to-end-evaluation.md)         | Add full-loop regression and evidence-quality evaluation fixtures      | 10, 35, 36                                |
| [38](issues/38-readiness-setup-runbook.md)       | Finish setup, doctor and explicit live verification runbook            | 6, 7, 10, 15, 21, 23, 29, 30, 33, 36, 37  |

## Milestones

- Foundation: 01–04. Typed contracts, migration, explicit configuration, isolated roles.
- Discovery and evidence: 05–14. Broad internet intake to independently reviewed claims.
- Memory and brief creation: 15–18. Versioned retrieval and reusable content briefs.
- Media and review: 19–25. Real Bangla image/video/audio production and enforced evidence gates.
- Delivery: 26–29. Rolling mix, orchestration and concrete Facebook adapters.
- Learning and maintenance: 30–36. Feedback, refresh, legacy audit, critical escalation, CLI, service and recovery.
- Verification and activation: 37–38. Full-loop evaluation, setup and live-readiness separation.

## Design choices and unresolved external setup

Settled: global multilingual discovery; no required initial URL list; Bangla output; Cognee retrieval plus authoritative ledger; four logical roles; one conflict reconciliation; initial + two content corrections; human editorial attention only for critical cases; Piper bn_BD; original explainers; Facebook Page publishing; rolling 10/25/65 mix.
Implementation defaults (configurable): SearXNG + Europe PMC; local HTTP/browser/PDF collectors; local deterministic rendering; five posts/day; cadence/budget values in spec. These are engineering defaults, not promises of source coverage or business outcomes.
External setup remaining: actual SearXNG endpoint/upstream configuration, Cognee release/provider credentials, role model assignments, exact Piper model/license/sample verification, local media tools/fonts, Page permissions/API version and optional authenticated sources. Tickets specify how to verify them; do not invent credentials or attest successful live runs.

## What completion means

A schema and fake-adapter demo alone are incomplete. Required adapters, real local rendering and full-loop integration must be implemented. Offline checks prove defined behavior; live access and publication require a recorded operator-triggered sample.
No work in this package authorizes arbitrary live posting, deleting historical posts, harvesting private identifiers or bypassing access challenges.
