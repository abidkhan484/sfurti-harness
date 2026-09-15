import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";

test("safe setup commands validate input and never publish implicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-setup-"));
  let writes = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      facebook: {
        submit: async () => {
          writes++;
          return {};
        },
      },
    },
  });
  try {
    await assert.rejects(app.execute({ type: "setup-probe", target: "bad" }), /requires/);
    await assert.rejects(app.execute({ type: "setup-sample", requestId: "one" }), /sourceId/);
    assert.deepEqual(await app.execute({ type: "setup-sample-status", requestId: "one" }), {
      requestId: "one",
      status: "missing",
    });
    await assert.rejects(
      app.execute({ type: "setup-send", artifactId: "missing", requestId: "send" }),
      /approved/
    );
    assert.equal(writes, 0);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
