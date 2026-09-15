import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
test("Pi preview service runs local cycle without Facebook writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-pi-e2e-"));
  let calls = 0;
  const app = createHarness({
    env: {},
    config: {
      storage: { databasePath: join(root, "db"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      facebook: {
        reconcile: async () => {
          calls++;
          return { status: "unknown" };
        },
      },
    },
  });
  try {
    await app.execute({ type: "service-cycle" });
    assert.equal(calls, 0);
    await assert.rejects(app.execute({ type: "publish" }), /preview/);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("offline Pi preview carries an owned source through intake, review, and local planning", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-pi-full-e2e-"));
  const inbox = join(root, "inbox");
  const submission = join(inbox, "owned-source");
  const source = join(submission, "video.mp4");
  const permission = join(submission, "permission.txt");
  const qualificationEvidence = join(root, "qualification-evidence.json");
  const video = join(root, "rendered.mp4");
  const image = join(root, "rendered.png");
  const text = join(root, "rendered.txt");
  const frame = join(root, "frame.png");
  await mkdir(submission, { recursive: true });
  await Promise.all([
    writeFile(source, "synthetic owned Bangla video"),
    writeFile(permission, "Permission to edit and publish to Facebook."),
    writeFile(qualificationEvidence, "synthetic timed frames and transcript"),
    writeFile(video, "synthetic reviewed video"),
    writeFile(image, "synthetic reviewed image"),
    writeFile(text, "শিশুর সঙ্গে আজ কাগজ দিয়ে কিছু বানাও।"),
    writeFile(frame, "synthetic review frame"),
    writeFile(
      join(submission, "permission.json"),
      JSON.stringify({
        schemaVersion: 1,
        submissionId: "owned-source",
        sourceId: "source-1",
        originalUrl: "https://example.test/owned-source",
        title: "Owned Bangla activity",
        language: "bn",
        videoFile: "video.mp4",
        permission: {
          evidenceFile: "permission.txt",
          scope: ["edit", "facebook"],
          restrictions: [],
        },
      })
    ),
    writeFile(join(submission, "READY"), ""),
  ]);
  let facebookWrites = 0;
  let telegramWrites = 0;
  const app = createHarness({
    env: {},
    clock: () => new Date("2026-09-15T04:00:00.000Z"),
    random: () => 0,
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview", intake: { path: inbox } },
      posting: {
        windows: [{ start: "11:00", end: "17:00" }],
        minSpacingMinutes: 60,
        queueCsvPath: join(root, "queue.csv"),
      },
    } as never,
    adapters: {
      discovery: {
        discover: async () => ({
          keywords: [{ id: "owned", query: "শিশুর কাজ", language: "bn", intent: "activity" }],
          sources: [{ id: "source-1", title: "Owned Bangla activity", language: "bn" }],
          matches: [{ keywordId: "owned", sourceId: "source-1" }],
          recommendations: [
            {
              sourceId: "source-1",
              canonicalUrl: "https://example.test/owned-source",
              title: "Owned Bangla activity",
              language: "bn",
              rationaleBn: "অনুমতি চাওয়া যেতে পারে",
              observedEvidence: ["metadata only"],
              limitations: ["No permission is implied by discovery"],
            },
          ],
        }),
      },
      media: {
        inspectSource: async () => ({
          durationMs: 90_000,
          frames: [{ timeMs: 1000, filePath: qualificationEvidence }],
          transcript: "নিজের হাতে একটি খেলনা বানাই",
          evidencePath: qualificationEvidence,
          limitations: ["synthetic offline fixture"],
        }),
        inspect: async ({ kind }: { kind: string }) =>
          kind === "video"
            ? {
                valid: true,
                durationSeconds: 35,
                width: 1080,
                height: 1920,
                evidence: {
                  frames: [{ filePath: frame, timeMs: 1000 }],
                  transcript: "নিজের হাতে একটি খেলনা বানাই",
                  audio: { intelligible: true, coverage: "full" },
                  coverage: "fixture sampling",
                  limitations: "synthetic offline fixture",
                },
              }
            : kind === "image"
              ? { valid: true, evidence: { frames: [frame] } }
              : { valid: true, evidence: {} },
      },
      qualifier: {
        qualify: async () => ({
          relevant: true,
          credible: true,
          locallyRelevant: true,
          candidateSets: [[{ startMs: 0, endMs: 35_000 }]],
          topics: ["Unintentional screen time and meaningful alternatives for children"],
          reviewerIdentity: "isolated-fixture-qualifier",
        }),
      },
      editor: {
        create: async ({ artifact }: { artifact: { kind: string } }) => ({
          filePath: artifact.kind === "video" ? video : artifact.kind === "image" ? image : text,
          caption: "নিজে কিছু তৈরি করি",
          ...(artifact.kind === "video" ? { segments: [{ startMs: 0, endMs: 35_000 }] } : {}),
        }),
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
      facebook: {
        submit: async () => facebookWrites++,
        cancel: async () => facebookWrites++,
      },
      delivery: { send: async () => telegramWrites++ },
    },
  });
  try {
    await app.execute({ type: "discover", requestId: "discover-owned" });
    const imported = (await app.execute({ type: "intake-scan" })) as Array<{ status: string }>;
    assert.equal(imported[0].status, "imported");
    const importedAgain = (await app.execute({ type: "intake-scan" })) as Array<{ status: string }>;
    assert.equal(importedAgain[0].status, "imported");
    const qualified = (await app.execute({
      type: "qualify-source",
      sourceId: "source-1",
      requestId: "qualify-owned",
    })) as { metadata: { qualified: boolean } };
    assert.equal(qualified.metadata.qualified, true);

    const sample = (await app.execute({
      type: "setup-sample",
      sourceId: "source-1",
      requestId: "owned-preview",
    })) as { status: string; artifactIds: string[] };
    assert.equal(sample.status, "complete");
    const local = (await app.execute({
      type: "request",
      requestId: "owned-image-text",
      images: 1,
      texts: 1,
      schedule: true,
    })) as { status: string; artifactIds: string[] };
    assert.equal(local.status, "complete");

    const state = (await app.execute({ type: "status" })) as {
      artifacts: Array<{ id: string; kind: string; status: string }>;
      posts: Array<{ artifactId: string; status: string }>;
      recommendations: Array<{ sourceId: string }>;
      notifications: Array<{ status: string }>;
    };
    assert.deepEqual(
      state.artifacts.map((artifact) => artifact.kind).sort(),
      ["image", "text", "video"]
    );
    assert.ok(state.artifacts.every((artifact) => artifact.status === "approved"));
    assert.equal(state.recommendations[0].sourceId, "source-1");
    assert.equal(state.posts.length, 2);
    assert.ok(state.posts.every((post) => post.status === "planned"));
    assert.ok(
      state.notifications.every((notification) =>
        ["pending", "queued"].includes(notification.status)
      )
    );

    await assert.rejects(app.execute({ type: "publish" }), /preview/);
    await assert.rejects(app.execute({ type: "cancel" }), /preview/);
    assert.equal(facebookWrites, 0);
    assert.equal(telegramWrites, 0);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
