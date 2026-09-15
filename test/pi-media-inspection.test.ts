import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectMediaFixture } from "../src/adapters/local/inspection.ts";
test("independent inspection fails silent or incomplete reel evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-inspect-"));
  try {
    const file = join(root, "clip.mp4"),
      frame = join(root, "frame.png");
    await writeFile(file, "fixture");
    await writeFile(frame, "frame");
    const base = {
      durationSeconds: 35,
      width: 1080,
      height: 1920,
      frames: [{ filePath: frame, timeMs: 1000 }],
      transcript: "বাংলা",
      audio: { intelligible: true, coverage: "full" },
      coverage: "sampled",
      limitations: "fixture",
    };
    assert.equal(inspectMediaFixture({ filePath: file, kind: "video", probe: base }).valid, true);
    assert.equal(
      inspectMediaFixture({
        filePath: file,
        kind: "video",
        probe: { ...base, audio: { intelligible: false } },
      }).valid,
      false
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
