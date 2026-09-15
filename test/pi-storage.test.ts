import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileIntegrity } from "../src/domain.ts";
import { Store } from "../src/store.ts";
import { reserveStorage } from "../src/deployment/storage.ts";
test("streaming file integrity and reservations are bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-storage-"));
  try {
    const file = join(root, "large.bin");
    await writeFile(file, Buffer.alloc(200_000, 7));
    assert.equal(fileIntegrity(file).bytes, 200_000);
    const store = new Store(join(root, "db.sqlite"));
    reserveStorage(store, {
      id: "one",
      bytes: 60,
      freeBytes: 200,
      managedBytes: 0,
      minFreeBytes: 100,
      ceilingBytes: 200,
      now: new Date(),
      leaseMs: 1000,
    });
    assert.throws(
      () =>
        reserveStorage(store, {
          id: "two",
          bytes: 50,
          freeBytes: 200,
          managedBytes: 0,
          minFreeBytes: 100,
          ceilingBytes: 200,
          now: new Date(),
          leaseMs: 1000,
        }),
      /rejected/
    );
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
