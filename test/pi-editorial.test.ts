import assert from "node:assert/strict";
import test from "node:test";
import { CodexEditorial, validEditorialDecision } from "../src/adapters/local/editorial.ts";
import type { TaskModelRouter } from "../src/adapters/llm.ts";
test("editorial decisions require bounded Bangla and reuse a completed idempotent decision", async () => {
  const records = new Map<string, unknown>();
  let calls = 0;
  const router = {
    structured: async () => ({
      value: {
        bodyBn: "নিজে একটি কাগজের কাজ বেছে নাও।",
        captionBn: "নিজে তৈরি করি",
        ageScope: "6-9",
        sourceAttribution: "operator-supplied source",
        overlays: ["নিজে চেষ্টা করো"],
        subtitles: [{ startMs: 0, endMs: 3000, textBn: "নিজে চেষ্টা করো" }],
      },
      provider: "codex",
      model: "test",
      threadId: "fresh",
    }),
  } as unknown as TaskModelRouter;
  const editor = new CodexEditorial(
    router,
    (id, value) => {
      calls++;
      records.set(id, value);
    },
    (id) => records.get(id)
  );
  const input = {
    artifactId: "a",
    kind: "video" as const,
    mission: "m",
    ageScope: "6-9",
    source: { qualified: true },
  };
  assert.equal((await editor.decide(input)).captionBn, "নিজে তৈরি করি");
  await editor.decide(input);
  assert.equal(calls, 1);
  assert.equal(
    validEditorialDecision({
      bodyBn: "english",
      captionBn: "english",
      ageScope: "x",
      sourceAttribution: null,
      overlays: [],
      subtitles: [],
    }),
    false
  );
});
