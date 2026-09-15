import assert from "node:assert/strict";
import test from "node:test";
import { loadToolManifest } from "../src/deployment/tool-manifest.ts";
test("tool manifest pins ARM64 multilingual small Whisper", () => {
  const value = loadToolManifest(
    new URL("../config/pi-tool-manifest.example.json", import.meta.url).pathname
  );
  assert.equal(value.architecture, "arm64");
  assert.equal(value.whisper.model, "small");
});
