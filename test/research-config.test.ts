import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";

test("research defaults preserve legacy behavior until explicitly enabled", () => {
  const config = loadConfig({});
  assert.equal(config.productionMode, "legacy");
  assert.equal(config.research.enabled, false);
  assert.deepEqual(config.content.weights, { text: 0.1, image: 0.25, video: 0.65 });
});

test("research configuration rejects unsafe rolling mix and integrations", () => {
  assert.throws(
    () => loadConfig({ content: { weights: { text: 0.2, image: 0.2, video: 0.2 } } } as never),
    /weights/
  );
  assert.throws(
    () => loadConfig({ productionMode: "evidence" } as never),
    /requires research.enabled/
  );
  assert.throws(() => loadConfig({ research: { queriesPerRun: -1 } } as never), /queriesPerRun/);
});
