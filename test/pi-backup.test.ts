import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
test("backup verifies into a new isolated destination without changing runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-pi-backup-"));
  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
    } as never,
    env: {},
  });
  try {
    await app.execute({ type: "daily-snapshot" });
    const backup = join(root, "backup");
    await app.execute({ type: "backup", destination: backup });
    const restored = (await app.execute({
      type: "restore-verify",
      source: backup,
      destination: join(root, "restored"),
    })) as { verified: boolean };
    assert.equal(restored.verified, true);
    assert.equal(((await app.execute({ type: "status" })) as { plans: unknown[] }).plans.length, 1);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
