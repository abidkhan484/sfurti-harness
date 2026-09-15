import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertDubbingEligible, normalizeBanglaNumbers } from "../src/adapters/local/dubbing.ts";
test("foreign dubbing requires permission, pinned bn_BD receipt and reviewed translation", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-dub-"));
  try {
    const model = join(root, "voice.onnx"),
      config = join(root, "voice.json");
    await writeFile(model, "model");
    await writeFile(config, "config");
    const digest = async (p: string) =>
      createHash("sha256")
        .update(await (await import("node:fs/promises")).readFile(p))
        .digest("hex");
    const source = {
      language: "en",
      transcript: "one",
      permission: { scope: ["edit", "facebook"] },
    };
    assert.throws(
      () => assertDubbingEligible({ source, modelPath: model, configPath: config }),
      /translate/
    );
    const result = assertDubbingEligible({
      source: { ...source, permission: { scope: ["edit", "facebook", "translate"] } },
      translation: { bangla: "12টি কাজ", reviewed: true },
      modelPath: model,
      configPath: config,
      receipt: {
        voiceId: "bn_BD-google-medium",
        speaker: 0,
        modelSha256: await digest(model),
        configSha256: await digest(config),
        approved: true,
        checkedAt: new Date().toISOString(),
      },
    });
    assert.equal(result.normalizedText, "১২টি কাজ");
    assert.equal(normalizeBanglaNumbers("2026"), "২০২৬");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
