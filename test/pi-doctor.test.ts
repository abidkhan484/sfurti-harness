import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";

test("Pi doctor reads receipts only and rejects stale or fixture evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-doctor-"));
  let calls = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      facebook: {
        probe: async () => {
          calls++;
        },
      },
    },
  });
  try {
    const doctor = (await app.execute({ type: "doctor" })) as {
      ready: boolean;
      liveChecksPerformed: boolean;
      connectionsVerified: { outcome: string };
    };
    assert.equal(doctor.ready, false);
    assert.equal(doctor.liveChecksPerformed, false);
    assert.equal(calls, 0);
    assert.equal(doctor.connectionsVerified.outcome, "failed");
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
