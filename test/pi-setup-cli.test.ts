import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
import { Store } from "../src/store.ts";
import { fileIntegrity } from "../src/domain.ts";

test("safe setup commands validate input and never publish implicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-setup-"));
  let writes = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      facebook: {
        submit: async () => {
          writes++;
          return {};
        },
      },
    },
  });
  try {
    await assert.rejects(app.execute({ type: "setup-probe", target: "bad" }), /requires/);
    await assert.rejects(app.execute({ type: "setup-sample", requestId: "one" }), /sourceId/);
    assert.deepEqual(await app.execute({ type: "setup-sample-status", requestId: "one" }), {
      requestId: "one",
      status: "missing",
    });
    await assert.rejects(
      app.execute({ type: "setup-send", artifactId: "missing", requestId: "send" }),
      /approved/
    );
    assert.equal(writes, 0);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("setup-send confirms one selected current artifact and never resends its request ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-setup-send-"));
  const databasePath = join(root, "db");
  const artifactPath = join(root, "sample.mp4");
  await writeFile(artifactPath, "owned preview");
  let calls = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath, mediaDirectory: root },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: { delivery: { send: async () => calls++ } },
  });
  const writer = new Store(databasePath);
  try {
    writer.put("artifacts", {
      id: "sample",
      status: "approved",
      filePath: artifactPath,
      versions: [{ number: 1, integrity: fileIntegrity(artifactPath) }],
    });
    writer.close();
    assert.deepEqual(await app.execute({ type: "setup-send", artifactId: "sample", requestId: "one" }), {
      artifactId: "sample",
      queued: false,
      sent: true,
    });
    assert.equal(calls, 1);
    await app.execute({ type: "setup-send", artifactId: "sample", requestId: "one" });
    assert.equal(calls, 1);
    const secondPath = join(root, "second.mp4");
    await writeFile(secondPath, "different owned preview");
    const secondWriter = new Store(databasePath);
    secondWriter.put("artifacts", {
      id: "second",
      status: "approved",
      filePath: secondPath,
      versions: [{ number: 1, integrity: fileIntegrity(secondPath) }],
    });
    secondWriter.close();
    await assert.rejects(
      app.execute({ type: "setup-send", artifactId: "second", requestId: "one" }),
      /different selected artifact/
    );
    assert.equal(calls, 1);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("setup-send holds a failed delivery and leaves no successful receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-setup-send-hold-"));
  const databasePath = join(root, "db");
  const artifactPath = join(root, "sample.mp4");
  await writeFile(artifactPath, "owned preview");
  let calls = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath, mediaDirectory: root },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      delivery: {
        send: async () => {
          calls++;
          throw new Error("synthetic lost response");
        },
      },
    },
  });
  const writer = new Store(databasePath);
  try {
    writer.put("artifacts", {
      id: "sample",
      status: "approved",
      filePath: artifactPath,
      versions: [{ number: 1, integrity: fileIntegrity(artifactPath) }],
    });
    writer.close();
    await assert.rejects(
      app.execute({ type: "setup-send", artifactId: "sample", requestId: "lost" }),
      /synthetic/
    );
    await assert.rejects(
      app.execute({ type: "setup-send", artifactId: "sample", requestId: "lost" }),
      /held/
    );
    assert.equal(calls, 1);
    const reader = new Store(databasePath);
    try {
      assert.equal(reader.get("setup_receipts", "setup-send:lost"), undefined);
    } finally {
      reader.close();
    }
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("setup-benchmark is preview-only and refuses fewer than three qualified sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-benchmark-"));
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: root },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
  });
  try {
    await assert.rejects(
      app.execute({ type: "setup-benchmark", requestId: "short" }),
      /three distinct/
    );
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
