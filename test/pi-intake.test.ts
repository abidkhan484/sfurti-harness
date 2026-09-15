import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
test("READY permission-backed folder imports idempotently and holds bad restrictions", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-inbox-"));
  try {
    const inbox = join(root, "inbox"),
      item = join(inbox, "sample");
    await mkdir(item, { recursive: true });
    await writeFile(join(item, "video.mp4"), "owned media");
    await writeFile(join(item, "evidence.pdf"), "permission");
    await writeFile(
      join(item, "permission.json"),
      JSON.stringify({
        schemaVersion: 1,
        submissionId: "sample",
        sourceId: "source",
        originalUrl: "https://example.test/source",
        title: "t",
        language: "bn",
        videoFile: "video.mp4",
        permission: { evidenceFile: "evidence.pdf", scope: ["edit", "facebook"], restrictions: [] },
      })
    );
    await writeFile(join(item, "READY"), "");
    const app = createHarness({
      config: {
        storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
        deployment: { profile: "pi-free", intake: { path: inbox } },
      } as never,
    });
    const first = (await app.execute({ type: "intake-scan" })) as { status: string }[];
    const again = (await app.execute({ type: "intake-scan" })) as { status: string }[];
    assert.equal(first[0].status, "imported");
    assert.equal(again[0].status, "imported");
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("unsafe paths and unresolved permission restrictions are held", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-inbox-hold-"));
  try {
    const inbox = join(root, "inbox"),
      item = join(inbox, "hold");
    await mkdir(item, { recursive: true });
    await writeFile(join(item, "evidence.pdf"), "permission");
    await writeFile(
      join(item, "permission.json"),
      JSON.stringify({
        schemaVersion: 1,
        submissionId: "hold",
        sourceId: "source",
        originalUrl: "https://example.test/source",
        title: "t",
        language: "bn",
        videoFile: "../outside.mp4",
        permission: {
          evidenceFile: "evidence.pdf",
          scope: ["edit", "facebook"],
          restrictions: ["no edits"],
        },
      })
    );
    await writeFile(join(item, "READY"), "");
    const app = createHarness({
      config: {
        storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
        deployment: { profile: "pi-free", intake: { path: inbox } },
      } as never,
    });
    const result = (await app.execute({ type: "intake-scan" })) as {
      status: string;
      reason: string;
    }[];
    assert.equal(result[0].status, "held");
    assert.match(result[0].reason, /path|restrictions/i);
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
