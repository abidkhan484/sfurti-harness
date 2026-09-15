import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalEditor } from "../src/adapters/local/editor.ts";
test("text renderer retains Bangla conjuncts and returns stable retained output", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-text-"));
  try {
    const editor = new LocalEditor({ chromium: "missing", fontPath: "/font", deadlineMs: 100 });
    const value = await editor.create({
      artifact: { kind: "text", id: "a" },
      outputDirectory: root,
      idempotencyKey: "one",
      bodyBn: "শিশুকে স্বাধীনভাবে সৃষ্টি করতে দিন।",
      captionBn: "নিজে করি",
    });
    assert.match(await readFile(value.filePath, "utf8"), /স্বাধীনভাবে/);
    assert.equal(
      (
        await editor.create({
          artifact: { kind: "text", id: "a" },
          outputDirectory: root,
          idempotencyKey: "one",
          bodyBn: "শিশুকে স্বাধীনভাবে সৃষ্টি করতে দিন।",
          captionBn: "নিজে করি",
        })
      ).filePath,
      value.filePath
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
