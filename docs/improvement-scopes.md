# Improvement Scopes — Sfurti Harness

> This document is a code-quality and design review produced by static analysis of the harness source on **2026-09-07**. All findings respect the locked product invariants in `docs/harness-design.md` and the ADRs. Nothing here overrides the mission, configuration constraints, or the three-version review limit.

---

## How to read this document

Each section identifies a **scope** (the file or subsystem reviewed), lists **specific findings**, grades their **priority** (`high / medium / low`), and suggests a concrete improvement. Findings do not duplicate what is already tracked in the architecture doc's verification checklist.

---

## 1. Code style and readability

**Files affected:** every `src/` module

The codebase is extremely dense. Statements are concatenated on single lines with almost no vertical whitespace, making control-flow hard to follow during incident response or code review.

| # | Finding | Priority |
|---|---------|----------|
| 1.1 | **Minification-style one-liners** — `coordinator.ts` lines 29–135 and `planning.ts` lines 89–122 pack complex loops, nested closures, and guard clauses onto single lines. A reviewer cannot read them without reformatting them locally first. | High |
| 1.2 | **Missing JSDoc / TSDoc on public functions** — `production()`, `planning()`, `tick()`, `request()`, `createHarness()` are all exported without any docstring describing their invariants, parameters, or what callers must ensure before invoking them. | Medium |
| 1.3 | **Opaque inline predicates** — predicates like `a.origin !== 'custom' && a.status !== 'failed' && ...` repeat four or five conditions inline inside `.filter()` callbacks. Naming them (e.g. `isEligibleForDailyPlan`) would make the intent clear and allow unit-testing the predicate in isolation. | Medium |
| 1.4 | **Magic string literals** — `'producing'`, `'approved'`, `'failed'`, `'pending'`, `'cleared'`, `'custom'`, `'daily'`, `'reserve'` appear in many files without a shared enum or `as const` union. A typo silently passes TypeScript's `string` type. | Medium |

**Suggested action:** run `prettier` (or the project's chosen formatter) with a line-length of 100 and extract named predicates. Define `ArtifactStatus`, `PostStatus`, `Origin`, and `SourceStatus` union types in `types.ts` and use them everywhere.

---

## 2. `src/types.ts` — public contracts

| # | Finding | Priority |
|---|---------|----------|
| 2.1 | **`Command` accepts `[key: string]: any`** — there is no compile-time checking on any command payload. A misspelled property (e.g. `artfactId` instead of `artifactId`) compiles silently and only fails at runtime. Discriminated union types per command (`ProduceCommand`, `PlanCommand`, etc.) would surface errors at the call site. | Medium |
| 2.2 | **`Context.adapters` is `Record<string, any>`** — every adapter access is unchecked at compile time. Callers do `ctx.adapters.editor?.create(...)` with no type on `create`'s argument or return value. A typed adapter bag (interfaces per adapter) would prevent silent mismatches. | Medium |
| 2.3 | **`today()` recreates `Intl.DateTimeFormat` on every call** — the formatter is recreated on every call. Caching per timezone would reduce hidden allocations in hot paths (coverage loops, tick). | Low |

---

## 3. `src/config.ts` — configuration loading

| # | Finding | Priority |
|---|---------|----------|
| 3.1 | **`loadConfig` is a monolithic 74-line function** — validation, defaulting, env-override, and path resolution are all interleaved. Any single step failing throws with no structural information about which section failed. Splitting into `applyDefaults()`, `applyEnvOverrides()`, `validateConfig()`, and `resolveConfigPaths()` would make each step testable independently. | Medium |
| 3.2 | **Hardcoded `'Asia/Dhaka'` enforced by a runtime throw** — the ADR should explicitly record this as a design constraint so a future developer does not treat the runtime throw as a bug. Currently no ADR covers it. | Low |
| 3.3 | **`merge()` accepts `any`** — the deep-merge helper discards all type information. Using a typed `DeepPartial<Config>` generic would prevent callers from accidentally passing unrelated objects. | Low |

---

## 4. `src/store.ts` — SQLite persistence

| # | Finding | Priority |
|---|---------|----------|
| 4.1 | **`all()` loads every row into memory** — `store.all('artifacts')` in `coordinator.ts` and `production.ts` fetches every artifact record every tick. As the library grows to 270 clips + image/text posts this will become a noticeable memory and latency cost. Adding `find()` and `filter()` methods with SQL `WHERE` clauses (by `date`, `status`, `kind`, `origin`, `requestId`) would allow targeted queries. | High |
| 4.2 | **`schema_migrations` table is unused** — the table is created and the single row `(1)` is inserted, but there is no migration runner. If a schema change is needed, there is no path to execute it safely on an existing database. Implementing even a minimal forward-only migration runner would protect production data. | Medium |
| 4.3 | **`transaction()` does not detect nested async attempts at compile time** — the guard `if (result instanceof Promise) throw new Error(...)` catches the mistake at runtime. A TypeScript overload returning `T` (not `Promise<T>`) could enforce this statically. | Low |
| 4.4 | **No index on frequently filtered columns** — artifact queries filter by `status`, `date`, `kind`, and `requestId` in JSON fields. SQLite supports JSON expression indexes (`CREATE INDEX IF NOT EXISTS ... ON artifacts(json_extract(data,'$.status'))`). Without them, every `store.all()` call does a full table scan. | Medium |

---

## 5. `src/app.ts` — harness entry point and command dispatcher

| # | Finding | Priority |
|---|---------|----------|
| 5.1 | **`status` command returns all rows from 11 collections at once** — a large deployment will produce a very large JSON response. A `--collection` filter or pagination parameter should be added before this becomes unusable. | Low |
| 5.2 | **`execute()` has double responsibility** — the idempotency wrapper and dispatcher are interleaved. Extracting `withIdempotency(store, command, () => dispatch(command))` as a named helper would make both concerns independently readable. | Low |
| 5.3 | **`safeConfig()` uses `structuredClone` then `delete`** — this is correct but can be replaced with a destructure (`const { integrations: _, ...safe } = config`) that is type-safe and does not require a `delete`. | Low |
| 5.4 | **`walk()` in `storage`/`cleanup-preview` is synchronous** — on a large media directory this will block the event loop. Using async `readdir` with `withFileTypes: true` recursively would keep the process responsive. | Medium |

---

## 6. `src/coordinator.ts` — tick and job scheduling

| # | Finding | Priority |
|---|---------|----------|
| 6.1 | **`store.all('artifacts')` inside a per-day, per-kind nested loop** — the coordinator calls `ctx.store.all('artifacts')` multiple times per tick inside loop bodies. On a large library this is O(N) per inner iteration. Pre-fetching once before the loop and filtering in memory would be much faster. | High |
| 6.2 | **`store.all('sources')` called inside the `eligible()` closure** — the closure re-reads all sources and all segments every time it is called. With dozens of cleared sources and hundreds of segments this compounds with 6.1. Pre-fetching before the loop is the same fix. | High |
| 6.3 | **Heartbeat swallows all errors silently** — `catch{/* Fenced at next handoff. */}` means a failing `renew()` call inside the heartbeat interval is never logged. If the database becomes unavailable the coordinator continues until the next explicit `renew()` fails. At minimum, the suppressed error should be recorded somewhere observable. | Medium |
| 6.4 | **`failures` array may contain many duplicates** — the deduplication happens only at reporting time. Deduplicating on insertion would keep the array small throughout the tick. | Low |
| 6.5 | **`dailyDue` toggles on the exact minute** — if the service restarts mid-minute, the production time window can be missed entirely. A small lookahead (e.g. within the last `tickMs` period) would help a delayed tick still catch the window. | Medium |

---

## 7. `src/production.ts` — artifact lifecycle

| # | Finding | Priority |
|---|---------|----------|
| 7.1 | **`production()` is 295 lines handling four distinct command types** — `discover`, `register-source`, `retry-artifact`, and `produce` are structurally different operations sharing one function body with early-return branches. Splitting into four named functions called from a thin dispatcher would make each flow independently readable and testable. | High |
| 7.2 | **`store.all('artifacts').find(...)` used as uniqueness check** — production uses `.find()` on the full artifact list for ownership and deduplication checks. A SQL `WHERE requestId = ?` query (see 4.1) would be both faster and atomic within the existing `store.transaction()`. | High |
| 7.3 | **`inspect()` catches all errors and converts them to review findings** — a broad `catch (error:any)` absorbs unexpected errors (e.g. an out-of-memory crash mid-inspection) and converts them into a `usability` finding. Only specific, expected `AdapterError` subclasses should be caught; unknown errors should propagate. | Medium |
| 7.4 | **`bounded()` closure uses manual `Promise.race` timeout** — `AbortSignal.timeout(ms)` combined with `AbortSignal.any([...])` would be more idiomatic and avoids the `clearTimeout` concern. | Low |
| 7.5 | **`statfsSync` called on every `produce` invocation** — disk space is checked synchronously before every artifact, briefly blocking the event loop. The adapter already provides an async `freeBytes()` — the synchronous fallback should be removed in favour of always using the async path. | Low |

---

## 8. `src/planning.ts` — scheduling and publication

| # | Finding | Priority |
|---|---------|----------|
| 8.1 | **`slots()` deterministic call in `makePlans()` lacks a comment** — the capacity-validation call with `()=>0` (line 102) has no comment explaining why a deterministic random is used there and why the result is discarded. | Low |
| 8.2 | **`windows()` reads from disk on every scheduling call** — `readFileSync(config.posting.windowsFile, 'utf8')` is called inside `windows()` which is called by `slots()` which is called in loops. The file should be read once and cached for the lifetime of the planning context. | Medium |
| 8.3 | **`publish()` moves posts across days in a loop that calls `slots()` per post** — when many posts miss their window, `windows()` (and thus disk read) is called per candidate day per post. Pre-reading the windows file would fix the compounded I/O from 8.2. | Medium |
| 8.4 | **`Proxy`-based `guardedStore` in `planning()`** — the `Proxy` intercepts every property access on the store to check ownership. If a new `Store` method is added, the proxy wraps it even if ownership enforcement is not needed. An explicit wrapper class with clear delegation would be safer. | Medium |
| 8.5 | **`dateAt()` hardcodes `+06:00`** — the UTC+6 offset is hardcoded (line 27) matching the single-context timezone constraint. A cross-reference comment pointing to the timezone invariant would help a future multi-context adaptation. | Low |

---

## 9. `src/notifications.ts` — notification delivery

| # | Finding | Priority |
|---|---------|----------|
| 9.1 | **Idempotency hash uses `JSON.stringify(event)` with no key ordering guarantee** — in practice all event objects are created literally so key order is consistent, but this is not documented. Using a sorted serialization would make the guarantee explicit. | Low |
| 9.2 | **`drainNotifications()` fetches all notifications with `store.all()`** — as the notifications table grows (failed/pending entries accumulate) this loads everything into memory. A `WHERE status != 'sent'` SQL filter (see 4.1) would keep the query targeted. | Medium |
| 9.3 | **`AbortController` + `Promise.race` timeout pattern is duplicated** — the same delivery timeout pattern appears in `notifications.ts` and `production.ts`. Extracting a shared `withTimeout(ms, work)` helper would avoid drift. | Low |

---

## 10. `src/maintenance.ts` — doctor and backup

| # | Finding | Priority |
|---|---------|----------|
| 10.1 | **`doctor` checks adapters by hardcoded name strings** — `['editor','media','reviewer','discovery','facebook','delivery']` is a hardcoded list. If a new adapter is added, the developer must remember to add it here too. Exporting the canonical adapter name list from `adapters/index.ts` would prevent silent omissions. | Low |
| 10.2 | **`cpSync` during backup is synchronous and blocks** — copying a large media library synchronously blocks the Node event loop. Using `fs/promises` async equivalents would keep the process responsive during backup. | Medium |
| 10.3 | **Backup does not verify the media copy** — the manifest records the database SHA-256 but nothing validates that the media files copied successfully or completely. A post-copy count comparison or manifest of file hashes would make the backup more trustworthy. | Medium |

---

## 11. `src/adapters/process.ts` — subprocess adapter

| # | Finding | Priority |
|---|---------|----------|
| 11.1 | **stderr bytes counted toward the output limit but not distinguished** — a subprocess that writes a large error to stderr can trigger `output_limit` even though stdout is empty. Tracking stderr bytes separately and using a dedicated error kind would make debugging easier. | Low |
| 11.2 | **`signal?.aborted` checked twice without explanation** — checked once before the `Promise` constructor and once after `addEventListener`. A comment explaining the TOCTOU rationale would help future readers. | Low |
| 11.3 | **Group kill logic prerequisite is implicit** — `process.kill(-child.pid, 'SIGKILL')` requires the child to be the process group leader, which is only true because `detached: true` was set. The dependency between `detached` and the group-kill should be documented in a comment. | Low |

---

## 12. `src/adapters/codex.ts` — Codex LLM strategy

| # | Finding | Priority |
|---|---------|----------|
| 12.1 | **Temporary directory created per request** — `mkdtemp` creates a new directory for every structured call. A persistent work directory reused between calls (with safe cleanup) would reduce filesystem churn, especially when Codex is used as the reviewer (three calls per artifact). | Low |
| 12.2 | **`threadId: null` comparison in independence check** — `thread.id` may be `null` for some Codex configurations. Comparing `null === null` would incorrectly report independence between editor and reviewer. The check in `inspect()` (`production.ts`) should explicitly guard against `null` threadIds. | Medium |
| 12.3 | **No retry on transient `unavailable` errors** — `AdapterError('unavailable', ...)` permanently fails an artifact with no opportunity to retry. Adding a limited retry count (e.g. 2 retries with exponential backoff) inside `CodexStrategy.structured()` for `unavailable` errors would improve robustness. | Medium |

---

## 13. `src/adapters/index.ts` — adapter composition

| # | Finding | Priority |
|---|---------|----------|
| 13.1 | **`createConfiguredAdapters()` has deeply nested inline logic** — the `delivery` adapter's `send` method is 200+ characters inline. Extracting named helper functions (`buildDeliveryAdapter`, `buildEditorAdapter`, etc.) would make each adapter's construction testable and readable. | Medium |
| 13.2 | **`capacity.check` always returns `{remaining: null}` (no-op stub)** — `null` is treated as "unlimited" by the caller, but the architecture says "unknown quota never means unlimited capacity". Either the stub should return a finite value, or the caller's `null` handling should be explicitly documented as "trust configured workload limits". | Medium |
| 13.3 | **`LlmStrategy` interface not re-exported from the public surface** — external code that wants to inject a custom LLM must know to import `LlmStrategy` from `codex.ts` directly. Exporting it from `adapters/index.ts` would make the extension point discoverable. | Low |

---

## 14. `src/domain.ts` — domain invariants

| # | Finding | Priority |
|---|---------|----------|
| 14.1 | **`fileIntegrity()` calls `statSync(path)` twice** — line 13 calls `statSync` twice to check `isFile()` and `.size`. A single `const stat = statSync(path)` reuse would avoid the double syscall. | Low |
| 14.2 | **`assertSourcePermission()` does not validate the `evidencePath` file extension** — while the content is integrity-checked, requiring a bounded set of formats (`.pdf`, `.txt`, etc.) would make it harder to accidentally pass a binary artifact as permission evidence. | Low |
| 14.3 | **`reviewSchema` is a raw JSON Schema object** — it is passed to `CodexStrategy.structured()` as `unknown`. A typed `JsonSchema` interface or using a library like `zod` for the schema definition would provide compile-time assurance that the schema matches `Review`. | Low |

---

## 15. `src/cli.ts` — command-line interface

| # | Finding | Priority |
|---|---------|----------|
| 15.1 | **`loadConfig` runs twice** — `loadConfig({}, env)` is called in the CLI and again inside `createHarness`. Passing the pre-loaded config via `HarnessOptions.config` (which already exists) avoids the double parse. | Low |
| 15.2 | **`--paused` flag semantics are confusing** — both `pause` and `pause --paused` set paused to `true`. There is no `--paused false` path. The flag adds confusion with no benefit; a plain `pause` / `resume` distinction is clearer. | Low |
| 15.3 | **No `--version` flag** — the CLI has no way to report the harness version from `package.json`. Adding `--version` would make it easy to confirm which version is running in production. | Low |

---

## 16. Test coverage gaps

**Files affected:** `test/`

The existing test files are good. The following scenarios are not currently covered:

| # | Gap | Priority |
|---|-----|----------|
| 16.1 | **Coordinator tick with a full `maxTasksPerTick` budget already consumed** — no test verifies the tick stops producing when the budget is reached, nor that daily and reserve work compete for the same budget. | High |
| 16.2 | **`store.all()` correctness with large record counts** — no test exercises the store with hundreds of artifacts to confirm sort order, deduplication, and memory behaviour. | Medium |
| 16.3 | **`planning.ts` lease guard with concurrent planners** — a test creating two `planning()` calls concurrently would confirm the lease logic works end-to-end. | Medium |
| 16.4 | **`notifications.ts` with repeated delivery failures** — no test exercises the `attempts` counter incrementing correctly over multiple failed sends. | Low |
| 16.5 | **`CodexStrategy` with `thread.id === null`** — the independence check compares thread IDs; if both are `null`, independence is falsely assumed. A test with a mock returning `threadId: null` would catch this. | Medium |

---

## 17. Dependency and tooling

| # | Finding | Priority |
|---|---------|----------|
| 17.1 | **No linter configured** — there is no ESLint or Biome configuration. A minimal linter with rules for `no-unused-vars`, `no-explicit-any`, and `eqeqeq` would catch a class of issues automatically. | Medium |
| 17.2 | **No formatter configured** — `prettier` or Biome is absent. The formatting issues in §1 would be fixed automatically with a formatter on save or in CI. | Medium |
| 17.3 | **`package.json` has no `"lint"` or `"format"` scripts** — even if a linter/formatter is installed, it is not integrated into the development workflow. | Low |
| 17.4 | **`@openai/codex-sdk` is a production dependency but used in one adapter only** — if the Codex adapter is not configured, the SDK is still installed. Marking it as `optionalDependencies` would keep the core harness lean. | Low |

---

## Summary by priority

| Priority | Count | Key themes |
|----------|-------|-----------|
| **High** | 7 | Dense one-liner style, `store.all()` full-table scans in loops, `production.ts` monolith, coordinator artifact re-queries, missing tick-budget test |
| **Medium** | 17 | Schema migrations, SQL indexes, windows file I/O in loops, `Proxy`-based guard, async media copy, Codex null threadId, capacity stub, linter/formatter |
| **Low** | 16 | Magic strings, double syscalls, minor CLI UX, `--version` flag, temp-dir churn, additional test coverage |

> The highest-leverage changes are: (1) add SQL indexes + targeted query methods to `Store`, (2) pre-fetch `store.all()` results before loop bodies in coordinator and production, and (3) split `production()` into per-command-type functions. These three address the most costly runtime issues without touching any product invariants.
