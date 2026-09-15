import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";

test("Pi preview rejects every Facebook mutation entry point before the adapter", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-publication-gate-"));
  try {
    let calls = 0;
    const app = createHarness({
      config: {
        storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: root },
        deployment: { profile: "pi-free", executionMode: "preview" },
      } as never,
      adapters: {
        facebook: {
          submit: async () => {
            calls++;
            return {};
          },
          cancel: async () => {
            calls++;
            return {};
          },
        },
      },
    });
    await assert.rejects(app.execute({ type: "publish" }), /preview/);
    await assert.rejects(app.execute({ type: "cancel" }), /preview/);
    await app.execute({ type: "service-cycle" });
    assert.equal(calls, 0);
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Pi continuous publication needs a separate explicit activation", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-publication-live-"));
  try {
    const app = createHarness({
      config: {
        storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: root },
        deployment: { profile: "pi-free", executionMode: "live" },
        integrations: {
          facebook: {
            kind: "graph",
            pageId: "page",
            graphApiVersion: "v26.0",
            tokenFile: "private-reference",
          },
        },
      } as never,
    });
    await assert.rejects(app.execute({ type: "publish" }), /not activated/);
    const activation = (await app.execute({
      type: "activate-publication",
      pageId: "page",
      confirmLive: true,
    })) as { active: boolean };
    assert.equal(activation.active, true);
    const deactivation = (await app.execute({
      type: "deactivate-publication",
      reason: "test",
    })) as { active: boolean };
    assert.equal(deactivation.active, false);
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
