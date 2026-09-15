import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
import { Store } from "../src/store.ts";

test("setup benchmark isolates its 3/1/1 workload and retains fixture measurements", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-pi-benchmark-"));
  const databasePath = join(root, "db.sqlite");
  const output = join(root, "output.bin");
  const textOutput = join(root, "output.txt");
  const frame = join(root, "frame.png");
  await Promise.all([
    writeFile(output, "fixture rendered output"),
    writeFile(textOutput, "আজ শিশুর সঙ্গে কিছু বানাও।"),
    writeFile(frame, "fixture frame"),
  ]);
  const app = createHarness({
    env: {},
    clock: () => new Date("2026-09-15T04:00:00.000Z"),
    config: {
      storage: { databasePath, mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
      limits: { maxTasksPerTick: 5 },
    } as never,
    adapters: {
      editor: {
        create: async ({ artifact }: { artifact: { kind: string } }) => ({
          filePath: artifact.kind === "text" ? textOutput : output,
          caption: "নিজে করি",
          ...(artifact.kind === "video" ? { segments: [{ startMs: 0, endMs: 35_000 }] } : {}),
        }),
      },
      media: {
        inspect: async ({ kind }: { kind: string }) =>
          kind === "video"
            ? {
                valid: true,
                durationSeconds: 35,
                width: 1080,
                height: 1920,
                evidence: {
                  frames: [{ filePath: frame, timeMs: 1000 }],
                  transcript: "নিজে করি",
                  audio: { intelligible: true, coverage: "full" },
                  coverage: "fixture",
                  limitations: "fixture",
                },
              }
            : kind === "image"
              ? { valid: true, evidence: { frames: [frame] } }
              : { valid: true, evidence: {} },
      },
      reviewer: {
        review: async () => ({
          passed: true,
          criteria: {
            mission: true,
            claims: true,
            context: true,
            age: true,
            bangla: true,
            usability: true,
          },
          findings: [],
        }),
      },
    },
  });
  try {
    for (const id of ["source-1", "source-2", "source-3"]) {
      const source = join(root, `${id}.mp4`);
      const permission = join(root, `${id}-permission.txt`);
      await Promise.all([writeFile(source, id), writeFile(permission, "edit and facebook")]);
      await app.execute({
        type: "register-source",
        sourceId: id,
        language: "bn",
        filePath: source,
        permission: { evidencePath: permission, scope: ["edit", "facebook"] },
      });
    }
    const writer = new Store(databasePath);
    try {
      for (const source of writer.all("sources"))
        writer.put("sources", {
          ...source,
          status: "cleared",
          metadata: {
            ...source.metadata,
            qualified: true,
            segments: [{ startMs: 0, endMs: 35_000 }],
          },
        });
      writer.put("jobs", {
        id: "ordinary-custom-work",
        origin: "custom",
        status: "pending",
        counts: { video: 0, image: 0, text: 1 },
        command: { type: "request", requestId: "ordinary-custom-work", texts: 1 },
      });
    } finally {
      writer.close();
    }

    const report = (await app.execute({ type: "setup-benchmark", requestId: "daily-1" })) as any;
    assert.equal(report.isolated, true);
    assert.equal(report.result.status, "complete");
    assert.equal(report.result.artifactIds.length, 5);
    assert.equal(report.measurements.stages.length, 5);
    assert.equal(report.measurements.stages.filter((stage: any) => stage.kind === "video").length, 3);
    assert.deepEqual(
      report.measurements.stages
        .filter((stage: any) => stage.kind === "video")
        .map((stage: any) => stage.sourceId)
        .sort(),
      ["source-1", "source-2", "source-3"]
    );
    assert.ok(report.measurements.stages.every((stage: any) => stage.outputBytes > 0));
    assert.equal(typeof report.measurements.storageProjection.packageOutputBytes, "number");
    const reader = new Store(databasePath);
    try {
      assert.equal(reader.get("jobs", "ordinary-custom-work")?.status, "pending");
      assert.equal(reader.get("meta", "setup-benchmark-active"), undefined);
    } finally {
      reader.close();
    }
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("routine ticks pause while a live benchmark lease is held", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-pi-benchmark-pause-"));
  const databasePath = join(root, "db.sqlite");
  const app = createHarness({
    env: {},
    config: { storage: { databasePath, mediaDirectory: root } } as never,
  });
  try {
    const writer = new Store(databasePath);
    try {
      writer.put("meta", {
        id: "setup-benchmark-active",
        leaseUntil: new Date(Date.now() + 60_000).toISOString(),
      });
    } finally {
      writer.close();
    }
    assert.equal((await app.execute({ type: "tick" })).status, "paused-for-setup-benchmark");
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
