import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AdapterError } from "../src/adapters/process.ts";
import { runLocalTool } from "../src/adapters/local/runner.ts";
import { redactSecrets, resolveSecretFile } from "../src/deployment/secrets.ts";

test("private token files are required and outputs are redacted", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-secret-"));
  try {
    const tokenPath = join(root, "token");
    await writeFile(tokenPath, "synthetic-secret-token\n", { mode: 0o600 });
    assert.equal(resolveSecretFile({ tokenFile: tokenPath }, "Telegram"), "synthetic-secret-token");
    assert.throws(
      () => resolveSecretFile({ tokenFile: join(root, "missing") }, "Telegram"),
      /unreadable/
    );
    assert.deepEqual(
      redactSecrets({ token: "x", message: "synthetic-secret-token" }, ["synthetic-secret-token"]),
      { token: "[REDACTED]", message: "[REDACTED]" }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local runner has a clean environment, argument-only launch, and a bounded deadline", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-runner-"));
  try {
    const safe = await runLocalTool({
      executable: "/bin/sh",
      args: ["-c", 'test -z "$SYNTHETIC_SECRET"'],
      cwd: root,
      outputRoot: root,
      deadlineMs: 1_000,
    });
    assert.equal(safe.code, 0);
    await assert.rejects(
      runLocalTool({
        executable: "/bin/sh",
        args: ["-c", "sleep 1"],
        cwd: root,
        outputRoot: root,
        deadlineMs: 20,
      }),
      (error: unknown) => error instanceof AdapterError && error.kind === "timeout"
    );
    await assert.rejects(
      runLocalTool({
        executable: "/bin/sh",
        args: ["-c", "printf 'xxxxxxxxxxxxxxxxxxxx'"],
        cwd: root,
        outputRoot: root,
        deadlineMs: 1_000,
        maxOutputBytes: 10,
      }),
      (error: unknown) => error instanceof AdapterError && error.kind === "output_limit"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
