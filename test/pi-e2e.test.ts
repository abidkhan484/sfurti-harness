import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
test("Pi preview service runs local cycle without Facebook writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-pi-e2e-"));
  let calls = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      facebook: {
        reconcile: async () => {
          calls++;
          return { status: "unknown" };
        },
      },
    },
  });
  try {
    await app.execute({ type: "service-cycle" });
    assert.equal(calls, 0);
    await assert.rejects(app.execute({ type: "publish" }), /preview/);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
