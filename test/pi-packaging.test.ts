import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("Pi compose is arm64, private, and defaults to doctor", () => {
  const compose = readFileSync(new URL("../docker-compose.pi-free.yml", import.meta.url), "utf8");
  assert.match(compose, /platform: linux\/arm64/);
  assert.match(compose, /posting-windows\.json.*:ro/);
  assert.match(compose, /pi-tool-manifest\.json.*:ro/);
  assert.match(compose, /command: \["doctor"\]/);
  assert.match(compose, /volumes:\n {2}sfurti-data:/);
  assert.doesNotMatch(compose, /docker\.sock/);
});
