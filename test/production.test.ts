import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHarness } from "../src/app.ts";

function fixture(overrides: Record<string, any> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sfurti-production-"));
  const output = join(dir, "post.txt");
  writeFileSync(output, "শিশুকে নিজের হাতে কিছু তৈরি করতে দিন।");
  const corrections: any[] = [];
  const adapters: Record<string, any> = {
    discovery: { discover: async () => ({ keywords: [], sources: [], matches: [] }) },
    editor: {
      create: async (input: any) => {
        corrections.push(input);
        return { filePath: output, caption: "একসঙ্গে তৈরি করি" };
      },
    },
    media: {
      inspect: async () => ({
        valid: true,
        evidence: { text: "শিশুকে নিজের হাতে কিছু তৈরি করতে দিন।" },
      }),
    },
    reviewer: {
      review: async () => ({
        passed: true,
        criteria: {
          mission: true,
          claims: true,
          context: true,
          age: true,
          bangla: true,
          usability: true,
        },
        findings: [],
      }),
    },
    ...overrides,
  };
  const options = {
    config: {
      storage: { databasePath: join(dir, "db.sqlite"), mediaDirectory: dir },
      topic: "সৃজনশীলতা",
      limits: { concurrency: 2 },
      daily: { videos: 0, images: 0, texts: 1 },
      posting: { queueCsvPath: join(dir, "queue.csv") },
    },
    adapters,
  } as any;
  const app = createHarness(options);
  return { app, adapters, dir, corrections, options };
}

test("custom production approves actual Bangla text, retains mission and never schedules it", async () => {
  const { app } = fixture();
  const result: any = await app.execute({
    type: "produce",
    kind: "text",
    origin: "custom",
    requestId: "request-1",
  });
  assert.equal(result.status, "approved");
  assert.equal(result.versions.length, 1);
  const state: any = await app.execute({ type: "status" });
  assert.equal(state.posts.length, 0);
  assert.equal(state.artifacts.length, 1);
  const again: any = await app.execute({
    type: "produce",
    kind: "text",
    origin: "custom",
    requestId: "request-1",
  });
  assert.equal(again.id, result.id);
  app.close();
});

test("three rejected versions retain precise feedback; explicit retry creates a linked attempt", async () => {
  const finding = {
    version: 1,
    location: "paragraph 1",
    criterion: "claims",
    evidence: "Unsupported benefit",
    correction: "Remove the unsupported benefit while preserving the activity",
    acceptanceCondition: "No unsupported material claim remains",
  };
  const { app, corrections, adapters } = fixture({
    reviewer: {
      review: async ({ version }: any) => ({
        passed: false,
        criteria: {
          mission: true,
          claims: false,
          context: true,
          age: true,
          bangla: true,
          usability: true,
        },
        findings: [{ ...finding, version: version.number }],
      }),
    },
  });
  const failed: any = await app.execute({
    type: "produce",
    kind: "text",
    origin: "custom",
    requestId: "failed",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.versions.length, 3);
  assert.deepEqual(corrections[1].feedback, [finding]);
  assert.equal(new Set(failed.versions.map((v: any) => v.filePath)).size, 3);
  adapters.reviewer.review = async () => ({
    passed: true,
    criteria: {
      mission: true,
      claims: true,
      context: true,
      age: true,
      bangla: true,
      usability: true,
    },
    findings: [],
  });
  const retried: any = await app.execute({
    type: "retry-artifact",
    artifactId: failed.id,
    reason: "Supporting evidence corrected",
  });
  assert.equal(retried.status, "approved");
  assert.notEqual(retried.id, failed.id);
  assert.equal(retried.retryOf, failed.id);
  assert.equal((await app.execute({ type: "artifact", artifactId: failed.id })).versions.length, 3);
  app.close();
});

test("registered permission is retained, scope enforced and concurrent clips cannot own overlapping intervals", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { app, dir, adapters } = fixture();
  const sourcePath = join(dir, "source.mp4"),
    permissionPath = join(dir, "permission.txt");
  writeFileSync(sourcePath, "authorized source");
  writeFileSync(permissionPath, "May edit for Facebook.");
  await assert.rejects(
    app.execute({
      type: "register-source",
      language: "bn",
      sourceId: "v1",
      filePath: sourcePath,
      permission: { evidencePath: permissionPath, scope: ["view"] },
    }),
    /scope/i
  );
  const registered: any = await app.execute({
    type: "register-source",
    language: "bn",
    sourceId: "v1",
    filePath: sourcePath,
    permission: { evidencePath: permissionPath, scope: ["edit", "facebook"] },
  });
  assert.notEqual(registered.permission.evidencePath, permissionPath);
  adapters.editor.create = async () => {
    await gate;
    return { filePath: sourcePath, caption: "বাংলা" };
  };
  const first = app.execute({
    type: "produce",
    kind: "video",
    origin: "custom",
    sourceId: "v1",
    segments: [{ startMs: 0, endMs: 35000 }],
  });
  await new Promise((r) => setTimeout(r, 10));
  await assert.rejects(
    app.execute({
      type: "produce",
      kind: "video",
      origin: "custom",
      sourceId: "v1",
      segments: [{ startMs: 1000, endMs: 36000 }],
    }),
    /limit|reserved/i
  );
  release();
  const failed: any = await first;
  assert.equal(failed.status, "failed");
  assert.equal(failed.versions.length, 3);
  assert.match(failed.versions[0].review.findings[0].evidence, /vertical|evidence/i);
  app.close();
});

test("discovery retains traced keywords and qualifies actual evidence without creating reuse permission", async () => {
  const { app, dir, adapters } = fixture();
  const evidencePath = join(dir, "qualification.txt");
  writeFileSync(evidencePath, "Transcript and content assessment.");
  adapters.discovery.discover = async () => ({
    keywords: [
      { id: "kw", query: "শিশুর সৃজনশীল কাজ", language: "bn", intent: "practical activity" },
    ],
    sources: [
      {
        id: "yt-1",
        title: "কাগজের কাজ",
        language: "bn",
        permission: { scope: ["edit", "facebook"] },
        metadata: {
          qualified: true,
          topic: "সৃজনশীলতা",
          segments: [{ startMs: 0, endMs: 35000 }],
          qualification: {
            relevant: true,
            credible: true,
            actualContentReviewed: true,
            locallyRelevant: true,
            evidencePath,
          },
        },
      },
    ],
    matches: [{ keywordId: "kw", sourceId: "yt-1" }],
  });
  await app.execute({ type: "discover" });
  await app.execute({ type: "discover" });
  const state: any = await app.execute({ type: "status" });
  assert.equal(state.sources.length, 1);
  assert.equal(state.sources[0].permission, undefined);
  assert.equal(state.sources[0].metadata.qualified, true);
  assert.equal(state.matches.length, 2);
  assert.equal(state.keywords.length, 2);
  assert.equal(new Set(state.matches.map((m: any) => m.keywordId)).size, 2);
  await assert.rejects(
    app.execute({
      type: "produce",
      kind: "video",
      origin: "custom",
      sourceId: "yt-1",
      segments: [{ startMs: 0, endMs: 35000 }],
    }),
    /permission/i
  );
  app.close();
});

test("restart with unknown quota preserves the artifact and a quota pause resumes the same version", async () => {
  let limited = true;
  const { app, adapters, options, dir } = fixture({
    capacity: { check: async () => ({ remaining: null }) },
  });
  const filePath = join(dir, "resumed.txt");
  writeFileSync(filePath, "একটি কাগজ দিয়ে নিজের পছন্দমতো কিছু বানাও।");
  adapters.editor.create = async () => {
    if (limited) throw Object.assign(new Error("Rate limited"), { kind: "rate-limit" });
    return { filePath, caption: "নিজে তৈরি করি" };
  };
  const paused: any = await app.execute({
    type: "produce",
    kind: "text",
    origin: "reserve",
    requestId: "resume",
  });
  assert.equal(paused.status, "producing");
  app.close();
  limited = false;
  const restarted = createHarness({ ...options, clock: () => new Date(Date.now() + 120_000) });
  const approved: any = await restarted.execute({
    type: "produce",
    kind: "text",
    origin: "reserve",
    requestId: "resume",
  });
  assert.equal(approved.id, paused.id);
  assert.equal(approved.status, "approved");
  assert.equal(approved.versions.length, 1);
  assert.equal((await restarted.execute({ type: "status" })).artifacts.length, 1);
  restarted.close();
});

test("timed-out inspection cannot launch review or approve a late result", async () => {
  const { options, app } = fixture();
  app.close();
  let release!: (value: any) => void;
  let reviews = 0;
  const pending = new Promise((r) => (release = r));
  options.adapters.media.inspect = async () => pending;
  options.adapters.reviewer.review = async () => {
    reviews++;
    return { passed: true };
  };
  const timed = createHarness({
    ...options,
    config: { ...options.config, limits: { taskTimeoutMs: 15, leaseMs: 30 } },
  });
  const artifact: any = await timed.execute({ type: "produce", kind: "text", origin: "custom" });
  assert.equal(artifact.status, "failed");
  release({ valid: true, evidence: {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(reviews, 0);
  assert.equal(
    (await timed.execute({ type: "artifact", artifactId: artifact.id })).status,
    "failed"
  );
  timed.close();
});

test("concurrent duplicate requests share one durable artifact even when quota checks overlap", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { app, adapters } = fixture({
    capacity: {
      check: async () => {
        await gate;
        return { remaining: null };
      },
    },
  });
  const left = app.execute({ type: "produce", kind: "text", origin: "custom", requestId: "same" });
  const right = app.execute({ type: "produce", kind: "text", origin: "custom", requestId: "same" });
  release();
  const results: any[] = await Promise.all([left, right]);
  assert.equal(results[0].id, results[1].id);
  assert.equal((await app.execute({ type: "status" })).artifacts.length, 1);
  app.close();
});

test("approved clips mark original intervals used, retain permission lineage and allow different later intervals", async () => {
  const { app, dir, adapters } = fixture();
  const filePath = join(dir, "clip.mp4"),
    framePath = join(dir, "frame.png"),
    permissionPath = join(dir, "permission.md");
  writeFileSync(filePath, "controlled media fixture");
  writeFileSync(framePath, "controlled image fixture");
  writeFileSync(permissionPath, "Editing for Facebook is authorized.");
  await app.execute({
    type: "register-source",
    language: "bn",
    sourceId: "approved-source",
    filePath,
    permission: { scope: ["edit", "facebook"], evidencePath: permissionPath },
  });
  adapters.editor.create = async () => ({ filePath, caption: "কাগজ দিয়ে তৈরি করি" });
  adapters.media.inspect = async () => ({
    valid: true,
    width: 1080,
    height: 1920,
    durationSeconds: 35,
    evidence: {
      frames: [{ filePath: framePath, timeMs: 1000 }],
      transcript: "কাগজ দিয়ে তৈরি করি",
      audio: { intelligible: true, coverage: "Entire 35 second audio" },
      coverage: "One frame sampled plus full transcript and audio",
      limitations: "Visual review is sampled",
    },
  });
  const first: any = await app.execute({
    type: "produce",
    kind: "video",
    origin: "custom",
    sourceId: "approved-source",
    segments: [{ startMs: 0, endMs: 35000 }],
  });
  assert.equal(first.status, "approved");
  assert.equal(first.sourceEvidence.permission.scope[0], "edit");
  assert.equal((await app.execute({ type: "status" })).segments[0].status, "used");
  await assert.rejects(
    app.execute({
      type: "produce",
      kind: "video",
      origin: "custom",
      sourceId: "approved-source",
      segments: [{ startMs: 20000, endMs: 55000 }],
    }),
    /reserved|used/
  );
  const second: any = await app.execute({
    type: "produce",
    kind: "video",
    origin: "custom",
    sourceId: "approved-source",
    segments: [{ startMs: 35000, endMs: 70000 }],
  });
  assert.equal(second.status, "approved");
  app.close();
});

test("daily workload cap is shared across discovery and production and survives restart without charging retries", async () => {
  const { app, options, adapters, dir } = fixture({
    capacity: { check: async () => ({ remaining: null }) },
  });
  app.close();
  let limited = true;
  const filePath = join(dir, "quota.txt");
  writeFileSync(filePath, "আজ শিশুকে নিজের মতো তৈরি করতে দিন।");
  adapters.editor.create = async () => {
    if (limited) throw Object.assign(new Error("limited"), { kind: "rate-limit" });
    return { filePath, caption: "নিজে তৈরি করি" };
  };
  const day = "2026-09-07T04:00:00Z";
  const limitedOptions = {
    ...options,
    clock: () => new Date(day),
    config: { ...options.config, limits: { concurrency: 2, maxTasksPerDay: 2 } },
  };
  const initial = createHarness(limitedOptions);
  const paused = await initial.execute({
    type: "produce",
    kind: "text",
    origin: "reserve",
    requestId: "daily-budget-retry",
  });
  assert.equal(paused.status, "producing");
  await initial.execute({ type: "discover", requestId: "research" });
  initial.close();
  limited = false;
  const restarted = createHarness({
    ...limitedOptions,
    clock: () => new Date("2026-09-07T05:00:00Z"),
  });
  const approved = await restarted.execute({
    type: "produce",
    kind: "text",
    origin: "reserve",
    requestId: "daily-budget-retry",
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.id, paused.id);
  for (const origin of ["daily", "custom", "reserve"]) {
    const deferred = await restarted.execute({
      type: "produce",
      kind: "text",
      origin,
      requestId: `blocked-${origin}`,
    });
    assert.equal(deferred.reason, "workload-limit");
  }
  assert.equal(
    (await restarted.execute({ type: "discover", requestId: "more-research" })).reason,
    "workload-limit"
  );
  // The exact successful discovery request is cached, requiring no extra allowance.
  assert.ok((await restarted.execute({ type: "discover", requestId: "research" })).batchId);
  restarted.close();
  const tomorrow = createHarness({
    ...limitedOptions,
    clock: () => new Date("2026-09-08T04:00:00Z"),
  });
  assert.equal(
    (await tomorrow.execute({ type: "produce", kind: "text", origin: "custom" })).status,
    "approved"
  );
  tomorrow.close();
});
