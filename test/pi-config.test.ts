import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";

test("Pi profile is opt-in and preserves the agreed safe defaults", () => {
  const legacy = loadConfig({});
  assert.equal(legacy.deployment, undefined);
  const config = loadConfig({ deployment: { profile: "pi-free" } } as never);
  assert.equal(config.deployment?.executionMode, "preview");
  assert.equal(config.llm.billingMode, "chatgpt-only");
  assert.deepEqual(config.daily, {
    videos: 3,
    images: 1,
    texts: 1,
    productionTimes: ["06:00", "07:00", "08:00"],
  });
  assert.equal(config.reserve.minimumDays, 90);
  assert.equal(config.productionMode, "legacy");
  assert.equal(config.research.enabled, false);
});

test("Pi profile rejects paid auth and policy contradictions", () => {
  assert.throws(
    () =>
      loadConfig({
        deployment: { profile: "pi-free" },
        integrations: { codex: { apiKeyEnv: "OPENAI_API_KEY" } },
      } as never),
    /API-key/
  );
  assert.throws(
    () => loadConfig({ deployment: { profile: "pi-free" }, daily: { videos: 2 } } as never),
    /3 videos/
  );
  assert.throws(
    () =>
      loadConfig({
        deployment: { profile: "pi-free", storageBudget: { minFreeBytes: -1 } },
      } as never),
    /storage budget/
  );
});
