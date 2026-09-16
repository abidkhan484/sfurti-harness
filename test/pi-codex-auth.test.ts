import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withIsolatedCodexAuth, codexAuthReceipt } from "../src/deployment/codex-auth.ts";
import { CodexStrategy } from "../src/adapters/codex.ts";
import { parseSetupReceipt } from "../src/deployment/contracts.ts";

test("isolated auth refresh persists only from the current cache generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-codex-auth-")),
    auth = join(root, "auth.json");
  try {
    await writeFile(auth, "old");
    await withIsolatedCodexAuth(auth, join(root, "one"), async () => {
      await writeFile(join(root, "one", "auth.json"), "new");
    });
    assert.equal(await readFile(auth, "utf8"), "new");
    await withIsolatedCodexAuth(auth, join(root, "two"), async () => {
      await writeFile(join(root, "two", "auth.json"), "stale");
      await writeFile(auth, "newer");
    });
    assert.equal(await readFile(auth, "utf8"), "newer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Pi Codex rejects API-key mode and exposes only sanitized probe data", () => {
  assert.throws(
    () =>
      new CodexStrategy({
        authDirectory: "/private/codex",
        apiKeyEnv: "OPENAI_API_KEY",
        chatgptOnly: true,
      }),
    /explicit authentication/
  );
  const strategy = new CodexStrategy({
    authDirectory: "/private/codex",
    chatgptOnly: true,
    models: ["codex-model"],
  });
  const probe = strategy.probe("codex-model");
  assert.equal(probe.authentication, "chatgpt-session");
  assert.equal(JSON.stringify(probe).includes("token"), false);
});
test("codexAuthReceipt kind survives parseSetupReceipt (must be codex-inference)", () => {
  const raw = codexAuthReceipt("/private/codex", "gpt-4o");
  assert.equal(raw.kind, "codex-inference");
  // Round-trip through the parser proves the kind is in the accepted enum.
  assert.doesNotThrow(() =>
    parseSetupReceipt({
      ...raw,
      id: "receipt-1",
      schemaVersion: 1,
      target: "codex",
      checkedAt: new Date().toISOString(),
      outcome: "passed",
      configFingerprint: "fp",
      evidencePaths: [],
      limitations: [],
    })
  );
});
