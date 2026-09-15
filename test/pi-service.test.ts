import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
