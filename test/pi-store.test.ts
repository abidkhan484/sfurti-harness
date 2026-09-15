import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../src/store.ts";

test("Pi migration is additive and repeatable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sfurti-pi-store-"));
  const path = join(directory, "state.sqlite");
  try {
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE artifacts (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data))); INSERT INTO artifacts VALUES ('old', '{\"id\":\"old\"}');"
    );
    old.close();
    const store = new Store(path);
    assert.deepEqual(store.get("artifacts", "old"), { id: "old" });
    store.put("setup_receipts", { id: "receipt", target: "codex" });
    store.close();
    const reopened = new Store(path);
    assert.equal(reopened.get("setup_receipts", "receipt")?.target, "codex");
    reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
