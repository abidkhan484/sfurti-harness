import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Store } from "../src/store.ts";
import { TelegramDelivery } from "../src/adapters/telegram.ts";

test("Telegram delivery records confirmed result and holds a lost response without duplicate send", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-telegram-"));
  try {
    const token = join(root, "token"),
      file = join(root, "sample.mp4");
    await writeFile(token, "secret-token");
    await writeFile(file, "fixture");
    const store = new Store(join(root, "db.sqlite"));
    let calls = 0;
    const delivery = new TelegramDelivery({
      operatorUserId: "1",
      tokenFile: token,
      store,
      request: async () => {
        calls++;
        return {
          status: 200,
          body: { ok: true, result: { message_id: 7, document: { file_id: "f" } } },
        };
      },
    });
    assert.equal(
      (
        (await delivery.send({ text: "নমুনা", artifactPaths: [file] }, "one")) as {
          messageId?: number;
        }
      ).messageId,
      7
    );
    await delivery.send({ text: "নমুনা", artifactPaths: [file] }, "one");
    assert.equal(calls, 1);
    const unknown = new TelegramDelivery({
      operatorUserId: "1",
      tokenFile: token,
      store,
      request: async () => {
        throw new Error("lost");
      },
    });
    await assert.rejects(unknown.send({ text: "নমুনা" }, "lost"), /lost/);
    await assert.rejects(unknown.send({ text: "নমুনা" }, "lost"), /held/);
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
