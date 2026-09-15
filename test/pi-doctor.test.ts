import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { Store } from "../src/store.ts";
import { doctorReadiness, readinessFingerprint, toolManifestHash } from "../src/deployment/readiness.ts";

test("Pi doctor reads receipts only and rejects stale or fixture evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-doctor-"));
  let calls = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      facebook: {
        probe: async () => {
          calls++;
        },
      },
    },
  });
  try {
    const doctor = (await app.execute({ type: "doctor" })) as {
      ready: boolean;
      liveChecksPerformed: boolean;
      connectionsVerified: { outcome: string };
    };
    assert.equal(doctor.ready, false);
    assert.equal(doctor.liveChecksPerformed, false);
    assert.equal(calls, 0);
    assert.equal(doctor.connectionsVerified.outcome, "failed");
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Pi readiness requires a current non-fixture receipt and hash-bound reviewed sample", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-doctor-receipts-"));
  const artifactPath = join(root, "sample.mp4");
  const evidencePath = join(root, "permission.txt");
  const manifestPath = join(root, "tools.json");
  await writeFile(artifactPath, "owned sample");
  await writeFile(evidencePath, "operator permission");
  await writeFile(manifestPath, "{}");
  const config = loadConfig(
    {
      storage: { databasePath: join(root, "db"), mediaDirectory: root },
      deployment: { profile: "pi-free", executionMode: "preview", localTools: { manifestPath } },
    } as never,
    {}
  );
  const store = new Store(config.storage.databasePath);
  const ctx = {
    store,
    config,
    adapters: {},
    now: () => new Date("2026-09-15T00:00:00.000Z"),
    random: Math.random,
    id: () => "test",
    mission: { version: "mission", text: "test" },
    notify: async () => {},
  };
  try {
    // Store the actual SHA through Node's already-tested streaming integrity helper.
    const { fileIntegrity } = await import("../src/domain.ts");
    const integrity = fileIntegrity(artifactPath);
    store.put("artifacts", {
      id: "sample",
      kind: "video",
      origin: "custom",
      status: "approved",
      filePath: artifactPath,
      sourceIds: ["source"],
      versions: [{ number: 1, integrity }],
    });
    store.put("sources", {
      id: "source",
      language: "bn",
      filePath: artifactPath,
      integrity,
      permission: {
        evidencePath,
        integrity: fileIntegrity(evidencePath),
        scope: ["edit", "facebook"],
        restrictions: [],
      },
    });
    store.put("reviews", { id: "review", artifactId: "sample", version: 1, passed: true });
    const fingerprint = readinessFingerprint(ctx);
    store.put("meta", {
      id: "setup-attestation",
      artifactId: "sample",
      artifactSha256: integrity.sha256,
      configFingerprint: fingerprint,
    });
    const receipt = (id: string, target: string, kind: string) => ({
      id,
      schemaVersion: 1,
      target,
      kind,
      checkedAt: ctx.now().toISOString(),
      outcome: "passed",
      configFingerprint: fingerprint,
      identityFingerprint: target,
      ...(kind === "native-tool" ? { toolManifestHash: toolManifestHash(ctx) } : {}),
      evidencePaths: [],
      limitations: [],
    });
    store.put("setup_receipts", receipt("native", "local", "native-tool"));
    store.put("setup_receipts", receipt("codex", "codex", "codex-inference"));
    store.put("setup_receipts", receipt("search", "search", "search"));
    store.put("setup_receipts", receipt("page", "facebook", "page-read"));
    store.put("setup_receipts", receipt("telegram", "telegram", "telegram-send"));
    assert.equal(doctorReadiness(ctx, []).ready, true);

    // Connection evidence is short lived in both directions: a receipt from
    // the future cannot be used to evade the seven-day policy either.
    store.put("setup_receipts", {
      ...receipt("codex", "codex", "codex-inference"),
      checkedAt: "2026-09-07T23:59:59.999Z",
    });
    assert.equal(doctorReadiness(ctx, []).connectionsVerified.outcome, "failed");
    store.put("setup_receipts", {
      ...receipt("codex", "codex", "codex-inference"),
      checkedAt: "2026-09-15T00:00:00.001Z",
    });
    assert.equal(doctorReadiness(ctx, []).connectionsVerified.outcome, "failed");
    store.put("setup_receipts", receipt("codex", "codex", "codex-inference"));

    // Read-back proof remains separate from bootstrap readiness and is bound
    // to one retained artifact version, hash, and output format.
    store.put("setup_receipts", {
      ...receipt("live", "facebook", "facebook-publish-readback"),
      remoteId: "facebook-post-1",
      artifactId: "sample",
      artifactVersion: "0",
      artifactSha256: integrity.sha256,
    });
    assert.equal(doctorReadiness(ctx, []).liveVerified.outcome, "failed");
    store.put("setup_receipts", {
      ...receipt("live", "facebook", "facebook-publish-readback"),
      remoteId: "facebook-post-1",
      artifactId: "sample",
      artifactVersion: "1",
      artifactSha256: integrity.sha256,
    });
    assert.deepEqual(doctorReadiness(ctx, []).liveVerified, {
      outcome: "passed",
      formats: { video: "passed" },
      limitations: ["Public-format proof is separate from bootstrap readiness."],
    });
    await writeFile(artifactPath, "sample changed after read-back");
    assert.equal(doctorReadiness(ctx, []).liveVerified.outcome, "failed");

    // A fixture-only receipt cannot repair a missing real connection receipt.
    store.put("setup_receipts", receipt("codex", "codex", "local-fixture"));
    assert.equal(doctorReadiness(ctx, []).ready, false);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
