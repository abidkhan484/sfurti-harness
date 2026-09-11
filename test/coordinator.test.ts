import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHarness } from "../src/app.ts";
function fixture(daily = { videos: 0, images: 0, texts: 1 }) {
  const root = mkdtempSync(join(tmpdir(), "sfurti-coordinator-")),
    output = join(root, "text.txt");
  writeFileSync(output, "আজ শিশুকে নিজের হাতে তৈরি করতে দিন।");
  let now = new Date("2026-09-07T23:59:00+06:00");
  const events: any[] = [];
  const config = {
    storage: { databasePath: join(root, "db"), mediaDirectory: root },
    daily,
    limits: { maxTasksPerTick: 1 },
    posting: {
      windows: [{ start: "09:00", end: "20:00" }],
      minSpacingMinutes: 60,
      queueCsvPath: join(root, "queue.csv"),
    },
  };
  const adapters = {
    editor: { create: async () => ({ filePath: output, caption: "একসঙ্গে তৈরি করি" }) },
    media: { inspect: async () => ({ valid: true, evidence: {} }) },
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
    delivery: {
      send: async (event: any) => {
        events.push(event);
      },
    },
  };
  const app = createHarness({ config, adapters, env: {}, clock: () => now, random: () => 0 });
  return {
    app,
    events,
    config,
    adapters,
    clock: () => now,
    time: (s: string) => {
      now = new Date(s);
    },
  };
}
test("background reserve does not seal daily settings before the next current-minute opportunity", async () => {
  const f = fixture();
  try {
    f.time("2026-09-08T05:59:00+06:00");
    await f.app.execute({ type: "tick" });
    let state = await f.app.execute({ type: "status" });
    assert.equal(state.plans.find((p: any) => p.date === "2026-09-08").snapshotSealed, undefined);
    assert.equal(state.artifacts[0].origin, "reserve");
    f.time("2026-09-08T06:00:10+06:00");
    await f.app.execute({ type: "tick" });
    state = await f.app.execute({ type: "status" });
    assert.equal(state.plans.find((p: any) => p.date === "2026-09-08").snapshotSealed, true);
    assert.equal(state.meta.filter((m: any) => m.id.startsWith("daily-opportunity:")).length, 1);
    await f.app.execute({ type: "tick" });
    assert.equal(
      (await f.app.execute({ type: "status" })).meta.filter((m: any) =>
        m.id.startsWith("daily-opportunity:")
      ).length,
      1
    );
    f.time("2026-09-08T08:01:00+06:00");
    await f.app.execute({ type: "tick" });
    assert.equal(
      (await f.app.execute({ type: "status" })).meta.filter((m: any) =>
        m.id.startsWith("daily-opportunity:")
      ).length,
      1
    );
  } finally {
    f.app.close();
  }
});

test("daily selection reports approved reserve allocations once and remains deduplicated after restart", async () => {
  const f = fixture();
  try {
    f.time("2026-09-08T05:30:00+06:00");
    const reserve = await f.app.execute({ type: "produce", kind: "text", origin: "reserve" });
    f.time("2026-09-08T06:00:00+06:00");
    await f.app.execute({ type: "tick" });
    const selected = f.events.filter((e) => e.type === "daily-selected");
    assert.equal(selected.length, 1);
    assert.equal(selected[0].posts[0].artifactId, reserve.id);
    assert.equal(selected[0].posts[0].filePath, reserve.filePath);
    assert.equal(selected[0].posts[0].caption, reserve.caption);
    assert.ok(selected[0].posts[0].scheduledAt);
    const second = createHarness({
      config: f.config,
      adapters: f.adapters,
      clock: f.clock,
      env: {},
      random: () => 0,
    });
    try {
      await second.execute({ type: "tick" });
      assert.equal(f.events.filter((e) => e.type === "daily-selected").length, 1);
    } finally {
      second.close();
    }
  } finally {
    f.app.close();
  }
});

test("unchanged idle coverage produces one reserve summary across repeated ticks", async () => {
  const f = fixture({ videos: 0, images: 0, texts: 0 });
  try {
    f.time("2026-09-08T09:00:00+06:00");
    await f.app.execute({ type: "tick" });
    await f.app.execute({ type: "tick" });
    await f.app.execute({ type: "tick" });
    assert.equal(f.events.filter((e) => e.type === "reserve-summary").length, 1);
    assert.equal(
      (await f.app.execute({ type: "status" })).plans.find((p: any) => p.date === "2026-09-08")
        .snapshotSealed,
      undefined
    );
    await f.app.execute({ type: "tick", daily: true });
    assert.equal(
      (await f.app.execute({ type: "status" })).plans.find((p: any) => p.date === "2026-09-08")
        .snapshotSealed,
      true
    );
  } finally {
    f.app.close();
  }
});
