# Current harness gaps and improvements

Status: ready-for-agent
Assessed: 2026-09-09 against working tree at 55b5fd4.
Read-only implementation inspection; no test-suite or live-readiness claim made by this assessment.
Only unrelated untracked docs/superpowers/ existed before this documentation work.

## Existing foundation to retain

| Capability                                   | Current evidence                                                         | Use in the new engine                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Shared application commands                  | src/app.ts:createHarness / execute                                       | Add research commands without a second independent app                       |
| Durable SQLite state                         | src/store.ts:Store and existing collections                              | Add versioned research tables, events and targeted queries                   |
| Isolated generation/review routing           | src/adapters/llm.ts:TaskModelRouter; src/adapters/index.ts:CodexReviewer | Add search/validation roles and stricter source/identity contracts           |
| Actual artifact inspection requirements      | src/production.ts:inspect                                                | Extend to evidence packets, OCR, ASR and original media                      |
| Bounded three-version correction loop        | src/production.ts:render/review lifecycle                                | Preserve separate transport and editorial attempts                           |
| Source video permission and segment tracking | src/domain.ts:assertSourcePermission; src/production.ts                  | Preserve for reused clips, separate from scientific evidence                 |
| Planning/publication/reconciliation          | src/planning.ts                                                          | Add claim freshness and rolling mix without losing remote-state distinctions |
| Independent service phases                   | src/service.ts:serviceCycle                                              | Add research/memory/feedback/refresh phases                                  |
| Process adapter and error classification     | src/adapters/process.ts                                                  | Reuse for bounded Piper/media operations                                     |
| Operator notifications and local doctor      | src/notifications.ts; src/maintenance.ts                                 | Add critical exceptions and precise readiness surfaces                       |

## Missing or insufficient for this requirement

| Gap                                    | Observed limit                                                                                  | Improvement / tickets                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Reusable research records              | Store collections contain media sources, not studies/findings/claims/topics                     | Contracts + migrations, 01–02                                   |
| Configuration/role semantics           | Fixed daily format counts; only generation/review task types                                    | Evidence-mode config and four roles, 03–04                      |
| Internet-wide search                   | Current discovery works around keywords and source videos, through configured external adapters | Agent query planning and concrete web/scholarly search, 05–07   |
| Scraping/extraction                    | No integrated bounded HTML/PDF/feed/browser research ingestion                                  | 08–11                                                           |
| Source register and topic validation   | No typed audience-vs-evidence queue or priority model                                           | 11–14                                                           |
| Evidence assessment                    | claims is a review boolean; no mandatory scientific excerpt/claim-version proof                 | 13–14 and 24–25                                                 |
| Cognee/retrieval                       | No memory adapter, dataset separation or index lifecycle                                        | 15–17                                                           |
| One topic to many assets               | No validated synthesis-to-brief dependency graph                                                | 18–19                                                           |
| Original explainers                    | production.ts video path requires permitted source video and segments                           | 20–23 and 27                                                    |
| Piper and actual render implementation | Configured process contracts are not a built-in narrated Bangla pipeline                        | 20–23                                                           |
| Publication mix                        | Defaults are 3 videos,1 image,1 text/day (60/20/20), not 65/25/10                               | 26                                                              |
| Multiple research topics               | Planner uses global topic equality; validated varied topics need allocation                     | 26–27                                                           |
| Real platform integrations             | ProcessFacebook is a wrapper requiring an external implementation                               | Concrete text/photo/Reel adapters and tested API mapping, 28–29 |
| Feedback loop                          | No audience-feedback records/collector driving research                                         | 30                                                              |
| Expiry/corrections                     | No scientific freshness or dependency invalidation in eligible()                                | 25 and 31                                                       |
| Legacy transition                      | Older approved artifacts have no scientific review lineage                                      | Preview-first audit, 32                                         |
| Critical-only human routing            | Generic notifications lack this editorial policy                                                | 33                                                              |
| Complete operator loop                 | Commands/service/readiness do not expose research lifecycle                                     | 34–38                                                           |
| Portable specification                 | docs/spec.md points at absent .scratch/sfurti-harness/spec.md; .scratch ignored                 | New tracked feature package and corrected docs/spec.md pointer  |

## Conflicts with earlier design, resolved explicitly

1. Bangla-first media discovery becomes a legacy clip preference; new research accepts any language/region and delivers Bangla.
2. Fixed counts by format remain in legacy mode; evidence mode uses rolling shares and total daily count.
3. Different source videos per day's clips remains for legacy clips; it must not force original explainers to invent source videos or different scientific references.
4. Automatic AI review remains the default. This feature adds critical-only human escalation, not routine claim approval by a human.
5. A 90-day reserve may contain provisional work; it cannot override claim expiry or be reported fully verified without valid evidence through scheduled use.
6. Existing remote-confirmed schedules remain remote facts. Scientific invalidation now requests cancellation/reconciliation; it does not pretend a local hold unscheduled the remote post.
7. Broad internet discovery is an agent capability; operators are not required to provide Facebook pages or seed URLs.

## Implementation priorities

First establish schemas, provenance and policy boundaries. Then complete a thin end-to-end path using real search, extraction, Cognee and text generation before adding media. Finish the feedback/correction loop before declaring completion.
Avoid a wholesale rewrite of Store/production/planning; add small modules and tested seams. Keep old tests to prove compatibility, but do not mistake compatibility with legacy claim review for adequacy in evidence mode.
Important checks: migration on existing database, no source-instruction execution, no claim promotion from memory, no repeated remote creation after timeout, stale-claim exclusion, independent Bangla audio review and recovery after provider quota deferral.
