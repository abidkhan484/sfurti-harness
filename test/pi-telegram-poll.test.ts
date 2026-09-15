import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
import { Store } from "../src/store.ts";
test("poll persists updates before dispatch and does not reprocess a durable receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-poll-"));
  try {
    const app = createHarness({
      config: {
        storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
        daily: { videos: 0, images: 0, texts: 0 },
      } as never,
      adapters: {
        telegram: {
          operatorUserId: "1",
          transport: {
            call: async () => [
              {
                update_id: 5,
                message: {
                  from: { id: 1 },
                  chat: { id: 1, type: "private" },
                  text: JSON.stringify({ type: "status" }),
                },
              },
            ],
          },
        },
        discovery: { discover: async () => ({ keywords: [], sources: [], matches: [] }) },
      },
    });
    await app.execute({ type: "service-cycle" });
    await app.execute({ type: "service-cycle" });
    const status = (await app.execute({ type: "status" })) as {
      telegram_updates: Array<{ status: string }>;
    };
    assert.equal(status.telegram_updates[0].status, "processed");
    assert.equal(status.telegram_updates.length, 1);
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("poll retries a durable held update even when the next poll is empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-poll-retry-"));
  const databasePath = join(root, "db.sqlite");
  try {
    let polls = 0;
    const app = createHarness({
      config: {
        storage: { databasePath, mediaDirectory: join(root, "media") },
        daily: { videos: 0, images: 0, texts: 0 },
      } as never,
      adapters: {
        telegram: {
          operatorUserId: "1",
          transport: {
            call: async () =>
              polls++ === 0
                ? [
                    {
                      update_id: 8,
                      message: {
                        from: { id: 1 },
                        chat: { id: 1, type: "private" },
                        text: JSON.stringify({ type: "status" }),
                      },
                    },
                  ]
                : [],
          },
        },
      },
    });
    await app.execute({ type: "service-cycle" });
    const writer = new Store(databasePath);
    const update = writer.get("telegram_updates", "8")!;
    writer.put("telegram_updates", { ...update, status: "held", lastError: "synthetic interruption" });
    writer.close();
    await app.execute({ type: "service-cycle" });
    const status = (await app.execute({ type: "status" })) as {
      telegram_updates: Array<{ id: string; status: string }>;
    };
    assert.equal(status.telegram_updates.find((update) => update.id === "8")?.status, "processed");
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
