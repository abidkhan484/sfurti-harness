import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
test("Pi compose is arm64, private, and defaults to doctor", () => {
  const compose = readFileSync(new URL("../docker-compose.pi-free.yml", import.meta.url), "utf8");
  assert.match(compose, /platform: linux\/arm64/);
  assert.match(compose, /posting-windows\.json.*:ro/);
  assert.match(compose, /pi-tool-manifest\.json.*:ro/);
  assert.match(compose, /command: \["doctor"\]/);
  assert.match(compose, /volumes:\n {2}sfurti-data:/);
  assert.doesNotMatch(compose, /docker\.sock/);
});
test("Pi setup init creates only missing non-secret local setup files", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-pi-init-"));
  const windowsFile = join(root, "config", "posting-windows.json");
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview", intake: { path: join(root, "inbox") } },
      posting: { windowsFile, minSpacingMinutes: 60, queueCsvPath: join(root, "queue.csv") },
    } as never,
  });
  try {
    assert.equal((await app.execute({ type: "setup-init" })).created.length, 1);
    const original = readFileSync(windowsFile, "utf8");
    assert.equal((await app.execute({ type: "setup-init" })).created.length, 0);
    assert.equal(readFileSync(windowsFile, "utf8"), original);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
