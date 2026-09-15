import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";

test("production accepts independent evidence but rejects a changed retained source before rendering", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-production-wire-"));
  try {
    const source = join(root, "source.mp4"),
      permission = join(root, "permission.txt"),
      output = join(root, "output.mp4"),
      frame = join(root, "frame.png");
    await writeFile(source, "owned source");
    await writeFile(permission, "edit facebook");
    await writeFile(output, "video output");
    await writeFile(frame, "frame");
    const adapters = {
      editor: {
        create: async () => ({
          filePath: output,
          caption: "নিজে করি",
          segments: [{ startMs: 0, endMs: 35_000 }],
        }),
      },
      media: {
        inspect: async () => ({
          valid: true,
          durationSeconds: 35,
          width: 1080,
          height: 1920,
          evidence: {
            frames: [{ filePath: frame, timeMs: 1000 }],
            transcript: "নিজে করি",
            audio: { intelligible: true, coverage: "full" },
            coverage: "fixture",
            limitations: "fixture",
          },
        }),
      },
      reviewer: {
        review: async () => ({
          passed: true,
          criteria: {
            mission: true,
            claims: true,
            context: true,
            age: true,
            bangla: true,
            usability: true,
          },
          findings: [],
        }),
      },
    };
    const app = createHarness({
      config: {
        storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      },
      adapters,
    });
    const registered = (await app.execute({
      type: "register-source",
      sourceId: "s",
      language: "bn",
      filePath: source,
      permission: { evidencePath: permission, scope: ["edit", "facebook"] },
    })) as { filePath: string };
    await writeFile(registered.filePath, "tampered retained source");
    await assert.rejects(
      app.execute({
        type: "produce",
        kind: "video",
        origin: "custom",
        sourceId: "s",
        segments: [{ startMs: 0, endMs: 35_000 }],
      }),
      /integrity changed/
    );
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
