# Pi deployment: implementation handoff

Status: ready-for-agent
Implementation: not started
Created: 2026-09-14
Baseline inspected: e8fa401

## Start here

This package specifies future implementation. It does not claim the application is ready or authorize public posting. The user requested documentation first; no application/configuration changes were made while creating it.

Read [spec](spec.md), [contracts](contracts.md), [acceptance scenarios](acceptance.md), then one ticket. Use [operator-first-test](operator-first-test.md) for human preparation and staged commands. [Source notes](source-notes.md) distinguish current repository evidence from upstream verification still needed.

## Work protocol for a small-model implementer

1. Read repository AGENTS.md, docs/agents/domain.md, CONTEXT.md and relevant ADRs. Read this README, the chosen ticket and its named spec/contracts sections. Never work from the title alone.
2. Inspect git status and the ticket's file pointers/immediate callers. Proposed filenames are implementation destinations, not existing APIs. Preserve unrelated docs/superpowers work.
3. Select one ticket whose dependencies have passing completion records. Canonical Status is triage; Implementation and Completion record show progress. Do not invent a done Status label or equate ready-for-agent with implemented.
4. Implement the ticket's concrete steps and failure cases. Ordinary reversible code changes can proceed once the user authorizes implementation. No paid services or API-key fallback. Missing account secrets do not block fixture implementation.
5. Run stated tests and record exact commands/results. Shared schema/orchestration changes require full regression checks. Do not suppress failing hooks or replace real assertions with mocks that always approve.
6. Append implementation result, files, checks and unresolved native/external prerequisites under Completion record/Comments. Never overwrite another ticket's discussion. A fixture-only result cannot satisfy native/account verification.
7. Continue in dependency order when the user authorized the package. Stop only for an actual missing external prerequisite or material unresolved requirement, with unaffected work completed. No automatic commit/push/publication.

No sub-agent execution is required by this package. Sequential implementation avoids collisions in shared files. If separately authorized parallel work is used later, serialize shared-file edits.

## Ticket order

Numeric order is a valid topological order. Tickets 01–28 implement and locally verify; 29 requires the actual Pi/operator inputs; 30 requires separate explicit public-post authorization and is not needed for the first preview.

| Ticket                                                      | Deliverable                                                          | Depends on                 | Work                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------- | --------------------- |
| [01](issues/01-pi-profile-contracts.md)                     | Define the Pi profile and durable contracts                          | —                          | agent implementation  |
| [02](issues/02-secret-and-tool-boundaries.md)               | Implement private secret loading and bounded native tools            | 01                         | agent implementation  |
| [03](issues/03-codex-auth-persistence.md)                   | Persist ChatGPT auth safely across isolated Codex tasks              | 01, 02                     | agent implementation  |
| [04](issues/04-durable-quota-tasks.md)                      | Complete durable quota deferral and role-specific resumption         | 03                         | agent implementation  |
| [05](issues/05-arm64-toolchain.md)                          | Package and pin the ARM64 media/search toolchain                     | 01, 02                     | agent implementation  |
| [06](issues/06-bounded-storage.md)                          | Implement streaming integrity and peak-space admission               | 01, 02                     | agent implementation  |
| [07](issues/07-folder-intake.md)                            | Import READY-marked permission-backed video folders                  | 06                         | agent implementation  |
| [08](issues/08-discovery-recommendations.md)                | Connect free discovery to ranked video recommendations               | 03, 04, 05                 | agent implementation  |
| [09](issues/09-source-qualification.md)                     | Inspect imported sources and qualify exact candidate intervals       | 04, 05, 07, 08             | agent implementation  |
| [10](issues/10-bangla-editorial-decisions.md)               | Generate bounded Bangla editorial decisions through Codex            | 04, 09                     | agent implementation  |
| [11](issues/11-text-image-renderer.md)                      | Render actual Bangla text files and mission images                   | 05, 06, 10                 | agent implementation  |
| [12](issues/12-licensed-clip-renderer.md)                   | Render permitted clips with original Bangla audio                    | 05, 06, 10                 | agent implementation  |
| [13](issues/13-optional-bangla-dubbing.md)                  | Add permission-gated local Bangla dubbing                            | 05, 06, 10, 12             | agent implementation  |
| [14](issues/14-independent-output-inspection.md)            | Collect independent evidence from finished artifacts                 | 05, 06, 11, 12             | agent implementation  |
| [15](issues/15-review-production-wiring.md)                 | Wire real adapters into independent approval and production          | 10, 11, 12, 14             | agent implementation  |
| [16](issues/16-telegram-delivery.md)                        | Implement durable private Telegram media delivery                    | 01, 02, 06                 | agent implementation  |
| [17](issues/17-telegram-polling.md)                         | Implement resumable private Telegram operator polling                | 16                         | agent implementation  |
| [18](issues/18-meta-api-contract.md)                        | Verify and record the current Meta API contract                      | 01                         | agent implementation  |
| [19](issues/19-facebook-text-photo.md)                      | Implement Page capability probes and text/photo submission           | 02, 18                     | agent implementation  |
| [20](issues/20-facebook-reels.md)                           | Implement resumable Reel upload and processing                       | 12, 19                     | agent implementation  |
| [21](issues/21-publication-authorization-reconciliation.md) | Enforce publication authorization and uncertain-outcome recovery     | 19, 20                     | agent implementation  |
| [22](issues/22-posting-window-setup.md)                     | Save evidence-backed windows and validate daily capacity             | 01                         | agent implementation  |
| [23](issues/23-readiness-receipts.md)                       | Add truthful staged doctor and sample attestation                    | 03, 08, 15, 16, 19, 21, 22 | agent implementation  |
| [24](issues/24-setup-command-workflow.md)                   | Expose safe setup probes and first-sample commands                   | 07, 09, 15, 17, 21, 23     | agent implementation  |
| [25](issues/25-pi-service-coordination.md)                  | Run bounded intake, discovery and production continuously            | 04, 06, 08, 09, 17, 21, 24 | agent implementation  |
| [26](issues/26-backup-restore.md)                           | Back up and verify the Pi library without losing lineage             | 06, 07, 21, 23             | agent implementation  |
| [27](issues/27-offline-end-to-end.md)                       | Prove complete preview and failure-recovery flows offline            | 13, 24, 25, 26             | agent implementation  |
| [28](issues/28-pi-packaging-runbook.md)                     | Finish reproducible Pi configuration and executable operator runbook | 05, 22, 24, 25, 26, 27     | agent implementation  |
| [29](issues/29-operator-first-preview.md)                   | Run the first real preview and Pi capacity benchmark                 | 28                         | operator verification |
| [30](issues/30-operator-selected-live-smoke.md)             | Optionally publish one explicitly selected approved sample           | 29                         | operator verification |

## Milestones

- 01–07: profile, secrets, durable Codex, native packaging, storage and permission intake.
- 08–15: useful recommendations, actual source qualification, real media and independent approval.
- 16–22: Telegram, verified Facebook contracts/connectors, mutation gate and posting windows.
- 23–28: truthful doctor, preview commands, continuous coordination, recovery and executable runbook.
- 29: first real sample and daily-capacity evidence on the Pi. One source is enough for the sample; three distinct qualified sources are required for the daily benchmark.
- 30: optional selected public smoke; continuous activation remains a separate operator command.

Full doctor-ready is not required to execute the first local sample. Public Facebook output is not required to attest local sample readiness. Spec S9 owns these meanings.

## Relationship to the research-engine tracker

Do not change or close tickets in .scratch/research-content-engine automatically. Its evidence-led original-content pipeline remains separate. Reuse current code after inspection:

| Research tickets | Reuse / overlap                                                    | This package's boundary                                                                                       |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 01–09, 15        | Existing schemas, role router, SearXNG, safe HTTP, memory boundary | Reuse applicable modules; no Cognee/research activation                                                       |
| 19–24            | Content rendering/TTS/inspection/review                            | Pi tickets 10–15 implement legacy permitted clips and practical text/images, not full approved-claim workflow |
| 28–29            | Facebook delivery/reconciliation                                   | Pi tickets 18–21 should supply reusable adapters; no claim that research publication gates are completed      |
| 35–38            | Service, backup, evaluation and doctor                             | Pi tickets 23–28 add an explicit deployment profile; research-mode completion remains independently tracked   |

ADR-0003 also requires session-aware deferral that current fresh-call code does not yet implement. Ticket 04 resolves that gap without sharing producer history with review.

## Documentation scope and persistence

This directory is intentionally local Markdown under .scratch/pi-free-readiness. Existing .gitignore ignores it. The package exists on disk but will not travel with normal git operations until explicitly included/versioned. Do not alter .gitignore, force-add all scratch files or commit automatically. If the operator moves execution to the Pi before versioning, transfer this whole directory privately with the repository.

## Handoff prompt

> Implement .scratch/pi-free-readiness/README.md in dependency order, one ticket at a time. Read each ticket's spec/contracts references, preserve existing work, and record completion evidence. Keep the Pi deployment in preview and use ChatGPT-only Codex authentication. Implement all fixture-testable work without asking for routine choices. Do not commit, push, send Telegram messages or publish to Facebook without the relevant explicit authorization. Stop before the real operator verification ticket and report the exact commands and inputs needed.
