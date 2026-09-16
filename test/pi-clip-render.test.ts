import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalClipEditor, assTimestamp } from "../src/adapters/local/editor.ts";

test("assTimestamp produces h:mm:ss.cs format for all durations", () => {
  assert.equal(assTimestamp(0), "0:00:00.00");
  assert.equal(assTimestamp(1000), "0:00:01.00");
  assert.equal(assTimestamp(3000), "0:00:03.00");
  assert.equal(assTimestamp(65_500), "0:01:05.50");
  assert.equal(assTimestamp(3_661_250), "1:01:01.25");
  assert.equal(assTimestamp(999), "0:00:00.99");
});

test("clip renderer preserves the exact allocated interval and reuses an atomic completed output", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-clip-"));
  try {
    const source = join(root, "source.mp4"),
      output = join(root, "artifact.mp4"),
      manifest = join(root, "manifest.json");
    await writeFile(source, "owned fixture source");
    await writeFile(output, "completed fixture");
    await writeFile(manifest, "{}");
    const editor = new LocalClipEditor({
      ffmpeg: "missing",
      fontPath: "/font",
      deadlineMs: 100,
      threads: 2,
    });
    const result = await editor.create({
      sourcePath: source,
      outputDirectory: root,
      idempotencyKey: "v1",
      caption: "নিজে করি",
      segments: [{ startMs: 0, endMs: 35_000 }],
      subtitles: [{ startMs: 0, endMs: 3000, textBn: "নিজে চেষ্টা করো {\\}" }],
    });
    assert.equal(result.filePath, output);
    assert.deepEqual(result.segments, [{ startMs: 0, endMs: 35_000 }]);
    await assert.rejects(
      editor.create({
        sourcePath: source,
        outputDirectory: root,
        idempotencyKey: "bad",
        caption: "বাংলা",
        segments: [{ startMs: 0, endMs: 29_000 }],
        subtitles: [],
      }),
      /30–60/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
