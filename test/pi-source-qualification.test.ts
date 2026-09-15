import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";

test("actual inspected source saves hash and mission-bound in-bounds candidate sets", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qualification-"));
  try {
    const source = join(root, "source.mp4"),
      permission = join(root, "permission.txt"),
      evidence = join(root, "inspection.json");
    await writeFile(source, "owned fixture video");
    await writeFile(permission, "edit facebook");
    await writeFile(evidence, "frames and transcript");
    const app = createHarness({
      config: {
        storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      },
      adapters: {
        media: {
          inspectSource: async () => ({
            durationMs: 90_000,
            frames: [{ timeMs: 1000, filePath: evidence }],
            transcript: "নিজে কিছু তৈরি করি",
            evidencePath: evidence,
            limitations: ["fixture"],
          }),
        },
        qualifier: {
          qualify: async () => ({
            relevant: true,
            credible: true,
            locallyRelevant: true,
            candidateSets: [[{ startMs: 0, endMs: 35_000 }]],
            topics: ["সৃজনশীলতা"],
            reviewerIdentity: "test-isolated",
          }),
        },
      },
    });
    await app.execute({
      type: "register-source",
      sourceId: "source",
      language: "bn",
      filePath: source,
      permission: { evidencePath: permission, scope: ["edit", "facebook"] },
    });
    const qualified = (await app.execute({
      type: "qualify-source",
      sourceId: "source",
      topic: "সৃজনশীলতা",
    })) as { filePath: string; metadata: { qualified: boolean; candidateSets: unknown[] } };
    assert.equal(qualified.metadata.qualified, true);
    assert.equal(qualified.metadata.candidateSets.length, 1);
    await writeFile(qualified.filePath, "modified");
    await assert.rejects(
      app.execute({
        type: "qualify-source",
        sourceId: "source",
        topic: "সৃজনশীলতা",
        requestId: "changed",
      }),
      /integrity changed/
    );
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
