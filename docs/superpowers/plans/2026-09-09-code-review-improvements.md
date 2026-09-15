# Code Review Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the 13 improvement items from the code-review to raise type safety, performance, data-consistency, readability, and correctness across the sfurti-harness codebase.

**Architecture:** Seven sequential tasks address the items in dependency order: quick wins first, then performance, then data-consistency, then config validation, then production refactor, then correctness fixes. No new runtime dependencies.

**Tech Stack:** Node 24.12+, TypeScript 7, node:sqlite (built-in), node:test (built-in).

## Global Constraints

- Node >= 24.12.0; TypeScript 7; no new npm dependencies.
- Test runner: `node --test test/*.test.ts` (run from repo root). All existing tests must remain green.
- Type check: `npm run typecheck`. Must emit no errors after every task.
- Branch: `feat/improve-model-usage`. Do NOT merge to main.
- Do not change observable runtime behaviour, external API shape, or SQLite schema.
- Preserve every existing comment and docstring unrelated to the change.
- Commit after each task with a conventional-commit message.

---

### Task 1: Fix double statSync + extract extractArtifactPaths helper

Items 5 and 13 from the code review.

**Files:**
- Modify: `src/domain.ts` (line 13)
- Modify: `src/adapters/index.ts` (line 68)

- [ ] **Step 1: Fix double statSync in src/domain.ts**

  Current line 13:
  ```ts
  if (typeof path !== 'string' || !statSync(path).isFile() || !statSync(path).size) throw new Error('A nonempty artifact or evidence file is required');
  ```

  Replace with:
  ```ts
  if (typeof path !== 'string') throw new Error('A nonempty artifact or evidence file is required');
  const stat = statSync(path);
  if (!stat.isFile() || !stat.size) throw new Error('A nonempty artifact or evidence file is required');
  ```

- [ ] **Step 2: Extract extractArtifactPaths helper in src/adapters/index.ts**

  Add this function above `createConfiguredAdapters`:
  ```ts
  function extractArtifactPaths(event: unknown): string[] | undefined {
    if (!isRecord(event)) return undefined;
    if (typeof event.filePath === 'string') return [event.filePath];
    if (isRecord(event.result) && typeof event.result.filePath === 'string') return [event.result.filePath];
    if (Array.isArray(event.posts)) {
      const paths = event.posts.filter(isRecord).map(p => p.filePath).filter((p): p is string => typeof p === 'string');
      return paths.length ? paths : undefined;
    }
    return undefined;
  }
  ```

  Replace the inline `artifactPaths` expression in `delivery.send` with:
  ```ts
  artifactPaths: extractArtifactPaths(event),
  ```

- [ ] **Step 3: Run typecheck**
  ```
  npm run typecheck
  ```
  Expected: exits 0 with no output.

- [ ] **Step 4: Run tests**
  ```
  node --test test/*.test.ts
  ```
  Expected: pass 43, fail 0.

- [ ] **Step 5: Commit**
  ```
  git add src/domain.ts src/adapters/index.ts
  git commit -m "refactor: remove double statSync and extract extractArtifactPaths helper"
  ```

---

### Task 2: Hoist windows() outside the planning loop

Item 4 from the code review.

**Files:**
- Modify: `src/planning.ts` (function `makePlans`, lines 89-122)

The `windows()` function does a `readFileSync` on the posting-windows JSON file. It is called inside `slots()`, which is called inside the per-date loop in `makePlans` — causing 90+ file reads per tick.

Because `config.posting` never changes per-date within a single `makePlans` call, the windows can be read once and reused.

- [ ] **Step 1: Add cached slots inside makePlans**

  Inside `makePlans`, right after the opening of the `ctx.store.transaction` callback and before the `for` loop, add:

  ```ts
  // Read windows once for the entire planning pass; posting config is global.
  const cachedWins = windows(ctx.config);
  const cachedSpacingMs = ctx.config.posting.minSpacingMinutes! * 60000;
  function cachedSlots(slotCtx: Context, config: Config, date: string, count: number, existing: Post[], earliest = slotCtx.now().getTime()): string[] {
    if (!count) return [];
    const available = cachedWins
      .map(m => Date.parse(dateAt(date, m)))
      .filter(t => t > earliest && existing.every(p => Math.abs(t - Date.parse(p.scheduledAt)) >= cachedSpacingMs));
    const chosen: number[] = [];
    let candidates = available;
    while (chosen.length < count) {
      const needed = count - chosen.length;
      const capacity: number[] = Array(candidates.length).fill(1);
      for (let i = candidates.length - 1; i >= 0; i--) {
        let low = i + 1, high = candidates.length;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (candidates[mid] - candidates[i] < cachedSpacingMs) low = mid + 1; else high = mid;
        }
        capacity[i] = 1 + (capacity[low] ?? 0);
      }
      const viable = candidates.filter((_, i) => capacity[i] >= needed);
      if (!viable.length) throw new Error(`Posting window/spacing conflict on ${date}: cannot fit ${count} posts`);
      const t = viable[Math.min(viable.length - 1, Math.max(0, Math.floor(slotCtx.random() * viable.length)))];
      chosen.push(t);
      candidates = candidates.filter(v => v - t >= cachedSpacingMs);
    }
    return chosen.map(t => new Date(t).toISOString());
  }
  ```

  Then replace the two `slots(…)` calls *inside the for loop* (lines ~102 and ~115) with `cachedSlots(…)`. Keep the top-level `slots()` function and its calls from `publish`, `cancel`, `schedule-custom` unchanged.

- [ ] **Step 2: Run typecheck**
  ```
  npm run typecheck
  ```
  Expected: exits 0.

- [ ] **Step 3: Run tests**
  ```
  node --test test/*.test.ts
  ```
  Expected: all pass, fail 0.

- [ ] **Step 4: Commit**
  ```
  git add src/planning.ts
  git commit -m "perf: hoist posting-windows file read outside the date loop in makePlans"
  ```

---

### Task 3: Pre-load hot collections in coordinator tick

Item 2 (coordinator hot paths) from the code review.

**Files:**
- Modify: `src/coordinator.ts` (function `tick`, inside the try block)

- [ ] **Step 1: Add snapshot variables before the custom-jobs loop**

  At the top of the `try` block in `tick` (just after `let produced=0, attempted=0; const failures: string[] = [];`), add:

  ```ts
  // Pre-load read-only snapshots; refresh after each production write.
  let allArtifacts: any[] = ctx.store.all('artifacts');
  let allSources: any[] = ctx.store.all('sources');
  let allSegments: any[] = ctx.store.all('segments');
  const refreshSnapshots = () => {
    allArtifacts = ctx.store.all('artifacts');
    allSources = ctx.store.all('sources');
    allSegments = ctx.store.all('segments');
  };
  ```

- [ ] **Step 2: Replace inline store.all calls with snapshot variables**

  Replace each `ctx.store.all('artifacts')`, `ctx.store.all('sources')`, `ctx.store.all('segments')` inside the for-loops with the snapshot variables.

  After each `await production(…)` call, add `refreshSnapshots();` so the next iteration sees fresh data.

  Keep `ctx.store.all('jobs')` reads as-is (jobs collection is small and needs fresh reads for status checks).

- [ ] **Step 3: Run typecheck**
  ```
  npm run typecheck
  ```
  Expected: exits 0.

- [ ] **Step 4: Run tests**
  ```
  node --test test/*.test.ts
  ```
  Expected: all pass, fail 0.

- [ ] **Step 5: Commit**
  ```
  git add src/coordinator.ts
  git commit -m "perf: pre-load artifact/source/segment collections before coordinator loops"
  ```

---

### Task 4: Atomic job status update after production

Item 3 from the code review.

**Files:**
- Modify: `src/coordinator.ts` (custom-job loop, post-production job update block)

- [ ] **Step 1: Wrap the job-status update in a transaction**

  In the custom-job loop, find the block after all `await production(…)` calls that reads artifacts and updates the job:
  ```ts
  const artifacts = ctx.store.all('artifacts').filter(a => typeof a.requestId === 'string' && a.requestId.startsWith(`${job.id}:`));
  const expected = Object.values(job.counts as Record<string, number>).reduce((a, b) => a + b, 0);
  const complete = artifacts.length === expected && artifacts.every(a => ['approved', 'failed'].includes(a.status));
  ctx.store.put('jobs', {...job, status: complete ? 'complete' : 'pending', artifactIds: artifacts.map(a => a.id)});
  ```

  Wrap the entire block in a transaction:
  ```ts
  ctx.store.transaction(() => {
    const artifacts = ctx.store.all('artifacts').filter(a => typeof a.requestId === 'string' && a.requestId.startsWith(`${job.id}:`));
    const expected = Object.values(job.counts as Record<string, number>).reduce((a, b) => a + b, 0);
    const complete = artifacts.length === expected && artifacts.every(a => ['approved', 'failed'].includes(a.status));
    ctx.store.put('jobs', {...job, status: complete ? 'complete' : 'pending', artifactIds: artifacts.map(a => a.id)});
  });
  ```

  Do NOT move any `await` inside the transaction — async work is forbidden (store.ts throws).

- [ ] **Step 2: Run typecheck**
  ```
  npm run typecheck
  ```
  Expected: exits 0.

- [ ] **Step 3: Run tests**
  ```
  node --test test/*.test.ts
  ```
  Expected: all pass, fail 0.

- [ ] **Step 4: Commit**
  ```
  git add src/coordinator.ts
  git commit -m "fix: wrap job status update in transaction after production completes"
  ```

---

### Task 5: Collect all config violations before throwing

Item 6 from the code review.

**Files:**
- Modify: `src/config.ts`
- Modify: `test/application.test.ts` (add one new test)

- [ ] **Step 1: Add a test for multi-violation collection**

  In `test/application.test.ts`, find where `loadConfig` is imported. If not imported, add:
  ```ts
  import { loadConfig } from '../src/config.ts';
  ```

  Add this new test (after existing config tests):
  ```ts
  it('loadConfig reports all violations at once', () => {
    assert.throws(
      () => loadConfig({ timezone: 'UTC', topic: '' } as any, {}),
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : '';
        return msg.includes('timezone') && msg.includes('topic');
      }
    );
  });
  ```

- [ ] **Step 2: Run the new test to verify it currently fails**
  ```
  node --test test/application.test.ts
  ```
  Expected: new test fails (current code throws on first violation only).

- [ ] **Step 3: Refactor loadConfig to use a violations collector**

  Replace the chain of individual `if (…) throw new Error(…)` checks (roughly lines 50-71) with a `violations` array + `check()` helper, then throw once at the end if violations exist. Keep env-override parsing (lines 42-48) as early throws (they set values used in subsequent checks). Keep path resolution (lines 73-77) and the distinct-path check (line 77) as late throws after the violations gate.

  Structure:
  ```ts
  const violations: string[] = [];
  const check = (condition: boolean, message: string) => { if (condition) violations.push(message); };

  // ... all check(...) calls replacing the individual throws ...

  if (violations.length) throw new Error(violations.join('\n'));

  // Path resolution below (only reached when constraints pass).
  ```

- [ ] **Step 4: Run the new test — it should pass now**
  ```
  node --test test/application.test.ts
  ```
  Expected: new test passes.

- [ ] **Step 5: Run full suite and typecheck**
  ```
  node --test test/*.test.ts
  npm run typecheck
  ```
  Expected: all tests pass, typecheck clean.

- [ ] **Step 6: Commit**
  ```
  git add src/config.ts test/application.test.ts
  git commit -m "refactor: collect all config violations before throwing"
  ```

---

### Task 6: Extract produceArtifact from the monolithic production function

Item 7 from the code review.

**Files:**
- Modify: `src/production.ts`

- [ ] **Step 1: Identify the extraction boundary**

  The `production()` export handles four command types. The long path starts after `if (acquired) return acquired;` (line 221) and runs through line 293. Extract everything from `const bounded = async …` to the final `return artifact;` into a new private async function `produceArtifact`.

- [ ] **Step 2: Create the extracted function**

  Add `async function produceArtifact(ctx: Context, artifact: Artifact, command: Command, source: RecordData|undefined, owner: string): Promise<Artifact>` immediately before `export async function production`. Move the following blocks into it:
  - `bounded` helper
  - `owned` check helper
  - The `try { while (…) { … } if (artifact.status !== 'approved') { … } } catch (error: any) { … } finally { … }` block
  - The `await ctx.notify(…)` call
  - `return artifact;`

- [ ] **Step 3: Replace the extracted code in production() with a call**

  After `if (acquired) return acquired;`, replace the entire removed block with:
  ```ts
  return produceArtifact(ctx, artifact, command, source, owner);
  ```

- [ ] **Step 4: Run typecheck**
  ```
  npm run typecheck
  ```
  Expected: exits 0.

- [ ] **Step 5: Run tests**
  ```
  node --test test/*.test.ts
  ```
  Expected: all tests pass, fail 0.

- [ ] **Step 6: Commit**
  ```
  git add src/production.ts
  git commit -m "refactor: extract produceArtifact from monolithic production function"
  ```

---

### Task 7: Heartbeat failure flag + notification deduplication scope

Items 9 and 11 from the code review.

**Files:**
- Modify: `src/coordinator.ts` (heartbeat block)
- Modify: `src/notifications.ts` (enqueueNotification)

- [ ] **Step 1: Add heartbeatFailed flag in coordinator.ts**

  Change the heartbeat declaration from:
  ```ts
  const heartbeat = setInterval(() => {try{renew();}catch{/* Fenced at next handoff. */}}, Math.max(100, Math.floor(ctx.config.limits.leaseMs/3)));
  ```
  To:
  ```ts
  let heartbeatFailed = false;
  const heartbeat = setInterval(() => {
    try { renew(); }
    catch { heartbeatFailed = true; /* Fenced at next explicit renew(). */ }
  }, Math.max(100, Math.floor(ctx.config.limits.leaseMs/3)));
  ```

  Add a `guardedRenew` that checks the flag before delegating:
  ```ts
  const guardedRenew = () => {
    if (heartbeatFailed) throw new Error('Coordinator ownership lost (heartbeat failed)');
    renew();
  };
  ```

  Replace the three explicit `renew()` calls inside the for-loops with `guardedRenew()`.

- [ ] **Step 2: Narrow notification deduplication scope in notifications.ts**

  Add a helper to identify summary-style events that should deduplicate per-day:
  ```ts
  function isDailyDeduped(event: unknown): boolean {
    if (typeof event !== 'object' || event === null) return false;
    const type = (event as Record<string, unknown>).type;
    return type === 'reserve-summary' || type === 'daily-selected' || type === 'command-result';
  }
  ```

  In `enqueueNotification`, replace:
  ```ts
  const id = createHash('sha256').update(`${today(ctx)}:${JSON.stringify(event)}`).digest('hex');
  ```
  With:
  ```ts
  const scope = isDailyDeduped(event)
    ? today(ctx)
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: ctx.config.timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(ctx.now());
  const id = createHash('sha256').update(`${scope}:${JSON.stringify(event)}`).digest('hex');
  ```

- [ ] **Step 3: Run typecheck**
  ```
  npm run typecheck
  ```
  Expected: exits 0.

- [ ] **Step 4: Run full test suite**
  ```
  node --test test/*.test.ts
  ```
  Expected: all tests pass, fail 0.

- [ ] **Step 5: Commit**
  ```
  git add src/coordinator.ts src/notifications.ts
  git commit -m "fix: heartbeat failure flag and narrowed notification deduplication for error events"
  ```

---

## Deferred items (require larger scope or separate design decisions)

- **Item 1** (Discriminated Command union + Adapters interface): cascades into all callers and tests.
- **Item 2** (SQLite JSON indexes): schema migration needed.
- **Item 8** (Lease proxy → explicit checks): architectural change, deserves its own ADR.
- **Item 10** (pre-built Config in createHarness): public API change.
- **Item 12** (Async transaction type guard): TypeScript limitation; document-only.
