import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
import { Store } from "../src/store.ts";
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
    const evidencePath = join(root, "external-review-evidence.json");
    await writeFile(evidencePath, "retained review evidence");
    const writer = new Store(join(root, "db"));
    writer.put("qualifications", { id: "qualification", evidencePath });
    writer.put("setup_receipts", { id: "receipt", evidencePaths: [evidencePath] });
    writer.close();
    const backup = join(root, "backup");
    const backupResult = (await app.execute({ type: "backup", destination: backup })) as {
      files: Array<{ path: string; backupPath: string }>;
    };
    const retained = backupResult.files.find((file) => file.path === evidencePath);
    assert.ok(retained?.backupPath.startsWith("lineage/"));
    assert.equal(await readFile(join(backup, retained!.backupPath), "utf8"), "retained review evidence");
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
