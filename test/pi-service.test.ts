import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";

test("Pi daily due opportunity catches up once after an exact minute is missed", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-service-"));
  const app = createHarness({
    env: {},
    clock: () => new Date("2026-09-15T00:01:00Z"),
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
      posting: {
        windows: [{ start: "09:00", end: "20:00" }],
        minSpacingMinutes: 60,
        queueCsvPath: join(root, "queue"),
      },
    } as never,
  });
  try {
    await app.execute({ type: "tick" });
    const state = (await app.execute({ type: "status" })) as {
      meta: Array<{ id: string; time?: string }>;
    };
    assert.equal(state.meta.find((m) => m.id === "daily-opportunity:2026-09-15")?.time, "06:00");
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Pi service records bounded phase attempts and keeps preview delivery local", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-service-phases-"));
  let deliveryCalls = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: { delivery: { send: async () => deliveryCalls++ } },
  });
  try {
    await app.execute({ type: "service-cycle" });
    const state = (await app.execute({ type: "status" })) as {
      service_tasks: Array<{ id: string; status: string }>;
    };
    assert.ok(state.service_tasks.some((task) => task.id === "service:intake"));
    assert.ok(state.service_tasks.some((task) => task.id === "service:production"));
    assert.equal(deliveryCalls, 0);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Pi low space defers new work without creating partial artifacts and reports unmet coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-service-low-space-"));
  const app = createHarness({
    env: {},
    clock: () => new Date("2026-09-15T00:01:00Z"),
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
      posting: {
        windows: [{ start: "09:00", end: "20:00" }],
        minSpacingMinutes: 60,
        queueCsvPath: join(root, "queue"),
      },
    } as never,
    adapters: { storage: { freeBytes: async () => 0 } },
  });
  try {
    const result = (await app.execute({ type: "tick" })) as {
      produced: number;
      coverage: { completeDays: number; days: unknown[] };
    };
    const state = (await app.execute({ type: "status" })) as {
      artifacts: unknown[];
      notifications: Array<{ event: { type: string } }>;
    };
    assert.equal(result.produced, 0);
    assert.equal(result.coverage.completeDays, 0);
    assert.ok(result.coverage.days.length >= 90);
    assert.deepEqual(state.artifacts, []);
    assert.ok(state.notifications.some((notification) => notification.event.type === "low-space"));
    assert.ok(state.notifications.some((notification) => notification.event.type === "reserve-summary"));
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Pi coordinators fence an expired owner so it cannot commit over the new owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-service-fencing-"));
  let now = new Date("2026-09-15T00:01:00Z");
  let renderCalls = 0;
  let startFirstRender!: () => void;
  let releaseFirstRender!: () => void;
  const firstRenderStarted = new Promise<void>((resolve) => (startFirstRender = resolve));
  const firstRender = new Promise<void>((resolve) => (releaseFirstRender = resolve));
  const output = join(root, "output.txt");
  await writeFile(output, "শিশুকে নিজের হাতে কিছু তৈরি করতে দিন।", "utf8");
  const adapters = {
    editor: {
      create: async () => {
        renderCalls++;
        if (renderCalls === 1) {
          startFirstRender();
          await firstRender;
        }
        return { filePath: output, caption: `caption-${renderCalls}` };
      },
    },
    media: { inspect: async () => ({ valid: true, evidence: {} }) },
    reviewer: {
      review: async () => ({
        passed: true,
        criteria: { mission: true, claims: true, context: true, age: true, bangla: true, usability: true },
        findings: [],
      }),
    },
  };
  const config = {
    storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
    deployment: { profile: "pi-free", executionMode: "preview" },
    posting: {
      windows: [{ start: "09:00", end: "20:00" }],
      minSpacingMinutes: 60,
      queueCsvPath: join(root, "queue"),
    },
    limits: { concurrency: 1, maxTasksPerTick: 1, taskTimeoutMs: 1_000, leaseMs: 5_000 },
  } as never;
  const left = createHarness({ env: {}, clock: () => now, config, adapters });
  const right = createHarness({ env: {}, clock: () => now, config, adapters });
  try {
    const staleRequest = left.execute({ type: "request", requestId: "fenced", texts: 1 });
    await firstRenderStarted;
    now = new Date(now.getTime() + 5_001);
    await right.execute({ type: "tick" });
    releaseFirstRender();
    await assert.rejects(staleRequest, /ownership lost/);
    const state = (await right.execute({ type: "status" })) as {
      artifacts: Array<{ id: string; status: string; caption: string; requestId: string }>;
    };
    assert.equal(renderCalls, 2);
    assert.deepEqual(
      state.artifacts.map(({ status, caption, requestId }) => ({ status, caption, requestId })),
      [{ status: "approved", caption: "caption-2", requestId: "fenced:text:0" }]
    );
  } finally {
    left.close();
    right.close();
    await rm(root, { recursive: true, force: true });
  }
});
