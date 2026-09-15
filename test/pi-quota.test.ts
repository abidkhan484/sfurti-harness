import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Store } from "../src/store.ts";
import { classifyCodexFailure, deferQuotaTask, quotaBlocked } from "../src/deployment/quota.ts";

test("quota deferral persists original route and uses bounded shared gate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sfurti-quota-"));
  const store = new Store(join(directory, "state.sqlite"));
  const now = new Date("2026-09-14T00:00:00Z");
  try {
    const task = deferQuotaTask(store, {
      taskId: "generation:1",
      role: "generation",
      provider: "codex",
      model: "kept-model",
      sessionRef: "session-1",
      now,
    });
    assert.equal(task.model, "kept-model");
    assert.equal(task.status, "deferred");
    assert.equal(quotaBlocked(store, "codex", now), true);
    assert.equal(classifyCodexFailure(new Error("429 quota")), "quota");
    assert.equal(classifyCodexFailure(new Error("401")), "authentication");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
