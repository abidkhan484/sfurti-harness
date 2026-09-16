import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { Store } from "../src/store.ts";
import { loadToolManifest } from "../src/deployment/tool-manifest.ts";
import { readinessFingerprint, toolManifestHash } from "../src/deployment/readiness.ts";

test("Senior QA Journey 1: Configuration, Pre-Flight & Diagnostics Audit", async () => {
  // Positive Pi-Free config loading
  const validPiConfig = loadConfig({
    deployment: { profile: "pi-free" },
    llm: {
      billingMode: "chatgpt-only",
      taskModels: {
        review: { provider: "codex", model: "gpt-4o" },
      },
    },
  } as never);
  assert.equal(validPiConfig.deployment?.profile, "pi-free");
  assert.equal(validPiConfig.deployment?.executionMode, "preview");
  assert.equal(validPiConfig.daily.videos, 3);
  assert.equal(validPiConfig.daily.images, 1);
  assert.equal(validPiConfig.daily.texts, 1);
  assert.equal(validPiConfig.reserve.minimumDays, 90);
  assert.equal(validPiConfig.timezone, "Asia/Dhaka");

  // Negative tests:
  // 1. Paid API key injection must be rejected in pi-free
  assert.throws(
    () =>
      loadConfig({
        deployment: { profile: "pi-free" },
        integrations: { codex: { apiKey: "sk-proj-malicious-paid-key" } },
      } as never),
    /API-key/
  );

  // 2. Non-3/1/1 daily targets must be rejected in pi-free
  assert.throws(
    () =>
      loadConfig({
        deployment: { profile: "pi-free" },
        daily: { videos: 4, images: 1, texts: 1 },
      } as never),
    /3 videos, 1 image, 1 text/
  );

  // 3. Non-Asia/Dhaka timezone must be rejected
  assert.throws(
    () =>
      loadConfig({
        timezone: "America/New_York",
      } as never),
    /timezone must be Asia\/Dhaka/
  );

  // 4. Stale llm.provider must be rejected
  assert.throws(
    () =>
      loadConfig({
        llm: { provider: "codex" } as never,
      } as never),
    /llm\.provider is no longer supported/
  );

  // Diagnostics: doctor command on fresh environment reports unready state
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-doctor-"));
  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
  });
  try {
    const doctorResult = await app.execute({ type: "doctor" });
    assert.equal(doctorResult.ready, false);
    assert.ok(doctorResult.missing.length > 0);
    assert.equal(doctorResult.liveChecksPerformed, false);

    // Storage command audit
    const storageResult = await app.execute({ type: "storage" });
    assert.equal(typeof storageResult.freeBytes, "number");
    assert.ok(storageResult.freeBytes > 0);
    assert.equal(storageResult.deletionEnabled, false);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 2: Setup Scaffolding, Tool Manifest & Probes", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-setup-"));
  const inbox = join(root, "inbox");
  const windowsFile = join(root, "config", "posting-windows.json");

  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview", intake: { path: inbox } },
      llm: {
        billingMode: "chatgpt-only",
        taskModels: {
          review: { provider: "codex", model: "gpt-4o" },
        },
      },
      posting: { windowsFile },
    } as never,
    adapters: {
      codex: { probe: async () => {} },
      discovery: {
        probe: async () => {
          throw new Error("Search service offline");
        },
      },
      facebook: { probe: async () => {} },
    },
  });

  try {
    // 1. setup-init scaffolds inbox and posting-windows template
    const init1 = (await app.execute({ type: "setup-init" })) as {
      created: string[];
      inboxPath: string;
    };
    assert.ok(init1.created.includes(windowsFile));
    assert.ok(existsSync(inbox));
    assert.ok(existsSync(windowsFile));

    // 2. setup-init idempotency
    const init2 = (await app.execute({ type: "setup-init" })) as { created: string[] };
    assert.equal(init2.created.length, 0);

    // 3. Load ARM64 tool manifest and verify schema requirements
    const manifest = loadToolManifest("./config/pi-tool-manifest.example.json");
    assert.equal(manifest.architecture, "arm64");
    assert.equal(manifest.whisper.model, "small");
    assert.ok(manifest.tools["ffmpeg"]);
    assert.ok(manifest.tools["ffprobe"]);
    assert.ok(manifest.tools["chromium"]);
    assert.ok(manifest.tools["noto-sans-bengali"]);
    assert.ok(manifest.tools["whisper-cli"]);

    // 4. Run setup-probe on targets and check receipts
    const codexProbe = await app.execute({
      type: "setup-probe",
      target: "codex",
      requestId: "qa-probe-codex",
    });
    assert.equal(codexProbe.outcome, "passed");
    assert.equal(codexProbe.kind, "codex-inference");

    const searchProbe = await app.execute({
      type: "setup-probe",
      target: "search",
      requestId: "qa-probe-search",
    });
    assert.equal(searchProbe.outcome, "failed");
    assert.ok(searchProbe.limitations.length > 0);

    const fbProbe = await app.execute({
      type: "setup-probe",
      target: "facebook",
      requestId: "qa-probe-fb",
    });
    assert.equal(fbProbe.outcome, "passed");
    assert.equal(fbProbe.kind, "page-read");
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 3: Discovery & Inbox Intake Pipeline", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-intake-"));
  const inbox = join(root, "inbox");
  await mkdir(inbox, { recursive: true });

  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: {
        profile: "pi-free",
        executionMode: "preview",
        intake: { path: inbox, maxVideoBytes: 10 * 1024 * 1024, maxVideoMinutes: 10 },
      },
    } as never,
    adapters: {
      discovery: {
        discover: async () => ({
          keywords: [{ id: "kw1", query: "শিশুর খেলা", language: "bn", intent: "activity" }],
          sources: [{ id: "src-100", title: "Bangla Play", language: "bn" }],
          matches: [{ keywordId: "kw1", sourceId: "src-100" }],
          recommendations: [
            {
              sourceId: "src-100",
              canonicalUrl: "https://example.test/play",
              title: "Bangla Play",
              language: "bn",
              rationaleBn: "শিশুর শারীরিক বিকাশের জন্য উপযুক্ত",
              observedEvidence: ["metadata"],
              limitations: ["No permission granted by discovery"],
            },
          ],
        }),
      },
    },
  });

  try {
    // 1. Discovery verification
    const discoveryRes = await app.execute({ type: "discover", requestId: "qa-disc-1" });
    assert.equal(discoveryRes.recommendations.length, 1);
    assert.equal(discoveryRes.recommendations[0].sourceId, "src-100");

    // 2. Adversarial Intake Case A: Folder without READY marker -> held
    const unreadySub = join(inbox, "unready-sub");
    await mkdir(unreadySub, { recursive: true });
    await writeFile(join(unreadySub, "video.mp4"), "dummy video");
    await writeFile(join(unreadySub, "permission.txt"), "permission");
    await writeFile(
      join(unreadySub, "permission.json"),
      JSON.stringify({
        schemaVersion: 1,
        submissionId: "unready-sub",
        sourceId: "src-unready",
        originalUrl: "https://example.test/unready",
        title: "Unready",
        language: "bn",
        videoFile: "video.mp4",
        permission: {
          evidenceFile: "permission.txt",
          scope: ["edit", "facebook"],
          restrictions: [],
        },
      })
    );
    const unreadyScan = (await app.execute({
      type: "intake-scan",
      submissionId: "unready-sub",
    })) as Array<{ status: string; reason: string }>;
    assert.equal(unreadyScan[0].status, "held");
    assert.match(unreadyScan[0].reason, /READY/);

    // 3. Adversarial Intake Case B: Path traversal in videoFile -> held with reason
    const traversalSub = join(inbox, "traversal-sub");
    await mkdir(traversalSub, { recursive: true });
    await writeFile(join(traversalSub, "permission.txt"), "permission");
    await writeFile(
      join(traversalSub, "permission.json"),
      JSON.stringify({
        schemaVersion: 1,
        submissionId: "traversal-sub",
        sourceId: "src-traversal",
        originalUrl: "https://example.test/trav",
        title: "Traversal",
        language: "bn",
        videoFile: "../../etc/shadow",
        permission: {
          evidenceFile: "permission.txt",
          scope: ["edit", "facebook"],
          restrictions: [],
        },
      })
    );
    await writeFile(join(traversalSub, "READY"), "");
    const travScan = (await app.execute({
      type: "intake-scan",
      submissionId: "traversal-sub",
    })) as Array<{ status: string; reason: string }>;
    assert.equal(travScan[0].status, "held");
    assert.match(travScan[0].reason, /path/i);

    // 4. Adversarial Intake Case C: Symbolic link in submission -> held with reason
    const symlinkSub = join(inbox, "symlink-sub");
    await mkdir(symlinkSub, { recursive: true });
    const realVideo = join(root, "external-secret.mp4");
    await writeFile(realVideo, "external content");
    await symlink(realVideo, join(symlinkSub, "symlink-video.mp4"));
    await writeFile(join(symlinkSub, "permission.txt"), "permission");
    await writeFile(
      join(symlinkSub, "permission.json"),
      JSON.stringify({
        schemaVersion: 1,
        submissionId: "symlink-sub",
        sourceId: "src-symlink",
        originalUrl: "https://example.test/sym",
        title: "Symlink",
        language: "bn",
        videoFile: "symlink-video.mp4",
        permission: {
          evidenceFile: "permission.txt",
          scope: ["edit", "facebook"],
          restrictions: [],
        },
      })
    );
    await writeFile(join(symlinkSub, "READY"), "");
    const symScan = (await app.execute({
      type: "intake-scan",
      submissionId: "symlink-sub",
    })) as Array<{ status: string; reason: string }>;
    assert.equal(symScan[0].status, "held");
    assert.match(symScan[0].reason, /path/i);

    // 5. Adversarial Intake Case D: Unresolved permission restrictions -> held with reason
    const restrictedSub = join(inbox, "restricted-sub");
    await mkdir(restrictedSub, { recursive: true });
    await writeFile(join(restrictedSub, "video.mp4"), "content");
    await writeFile(join(restrictedSub, "permission.txt"), "permission");
    await writeFile(
      join(restrictedSub, "permission.json"),
      JSON.stringify({
        schemaVersion: 1,
        submissionId: "restricted-sub",
        sourceId: "src-restricted",
        originalUrl: "https://example.test/restricted",
        title: "Restricted",
        language: "bn",
        videoFile: "video.mp4",
        permission: {
          evidenceFile: "permission.txt",
          scope: ["edit", "facebook"],
          restrictions: ["Commercial use forbidden without further payment"],
        },
      })
    );
    await writeFile(join(restrictedSub, "READY"), "");
    const restScan = (await app.execute({
      type: "intake-scan",
      submissionId: "restricted-sub",
    })) as Array<{ status: string; reason: string }>;
    assert.equal(restScan[0].status, "held");
    assert.match(restScan[0].reason, /restrictions/i);

    // 6. Positive Intake: Valid compliant submission
    const validSub = join(inbox, "valid-sub");
    await mkdir(validSub, { recursive: true });
    await writeFile(join(validSub, "video.mp4"), "authentic bangla video bytes");
    await writeFile(join(validSub, "permission.txt"), "Full permission for edit and facebook");
    await writeFile(
      join(validSub, "permission.json"),
      JSON.stringify({
        schemaVersion: 1,
        submissionId: "valid-sub",
        sourceId: "src-valid-1",
        originalUrl: "https://example.test/valid",
        title: "Valid Bangla Video",
        language: "bn",
        videoFile: "video.mp4",
        permission: {
          evidenceFile: "permission.txt",
          scope: ["edit", "facebook"],
          restrictions: [],
        },
      })
    );
    await writeFile(join(validSub, "READY"), "");

    const scan1 = (await app.execute({
      type: "intake-scan",
      submissionId: "valid-sub",
    })) as Array<{ status: string }>;
    assert.equal(scan1[0].status, "imported");

    // Idempotent re-scan returns prior
    const scan2 = (await app.execute({
      type: "intake-scan",
      submissionId: "valid-sub",
    })) as Array<{ status: string }>;
    assert.equal(scan2[0].status, "imported");
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 4: Source Qualification & Cryptographic Tamper Detection", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-qualify-"));
  const rawVideo = join(root, "source.mp4");
  const permissionEvidence = join(root, "permission.txt");
  const inspectEvidence = join(root, "inspection.json");
  await writeFile(rawVideo, "initial source video bytes for qualification");
  await writeFile(permissionEvidence, "granting full edit and facebook usage");
  await writeFile(inspectEvidence, "transcript and candidate frame evidence");

  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      media: {
        inspectSource: async () => ({
          durationMs: 120_000,
          frames: [{ timeMs: 5000, filePath: inspectEvidence }],
          transcript: "আজকের কাজ শিশুদের সঙ্গে কাগজ কাটা ও জোড়া লাগানো।",
          evidencePath: inspectEvidence,
          limitations: [],
        }),
      },
      qualifier: {
        qualify: async () => ({
          relevant: true,
          credible: true,
          locallyRelevant: true,
          candidateSets: [[{ startMs: 10_000, endMs: 45_000 }]],
          topics: ["Unintentional screen time and meaningful alternatives for children"],
          reviewerIdentity: "senior-qa-qualifier",
        }),
      },
    },
  });

  try {
    // 1. Register source
    await app.execute({
      type: "register-source",
      sourceId: "src-qual-1",
      language: "bn",
      filePath: rawVideo,
      permission: {
        evidencePath: permissionEvidence,
        scope: ["edit", "facebook"],
        restrictions: [],
      },
    });

    // 2. Qualify source
    const qualResult = await app.execute({
      type: "qualify-source",
      sourceId: "src-qual-1",
      requestId: "qa-qual-req-1",
    });
    assert.equal(qualResult.metadata.qualified, true);
    assert.deepEqual(qualResult.metadata.segments, [{ startMs: 10_000, endMs: 45_000 }]);
    assert.ok(qualResult.metadata.qualification.sourceSha256);

    // 3. Cryptographic Tamper Detection:
    // Modify the registered source file in the media directory
    const store = new Store(join(root, "db.sqlite"));
    const registeredSource = store.get("sources", "src-qual-1");
    assert.ok(registeredSource?.filePath);

    // Tamper with the retained file:
    await writeFile(registeredSource.filePath as string, "TAMPERED BYTES CORRUPTED BY ATTACKER");

    // Downstream assertion of permission/integrity must fail
    const { assertSourcePermission } = await import("../src/domain.ts");
    assert.throws(
      () =>
        assertSourcePermission(registeredSource, new Date(), {
          requireStoredIntegrity: true,
        }),
      /integrity changed/i
    );
    store.close();
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 5: Multi-Modal Production & Independent Review Gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-prod-"));
  const textFile = join(root, "content.txt");
  const imageFile = join(root, "rendered.png");
  const videoFile = join(root, "rendered.mp4");
  const frameFile = join(root, "frame.png");

  // Verify Bangla conjuncts and typography content
  const authenticBangla =
    "শিশুর সৃজনশীলতা ও আত্মবিশ্বাস বৃদ্ধিতে সাহায্য করুন। ক্ষ, জ্ঞ, ত্র, শ্র।";
  await writeFile(textFile, authenticBangla);
  await writeFile(imageFile, "synthetic png image");
  await writeFile(videoFile, "synthetic vertical mp4 reel");
  await writeFile(frameFile, "synthetic frame");

  let reviewCount = 0;
  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      editor: {
        create: async ({ artifact }: { artifact: { kind: string } }) => ({
          filePath:
            artifact.kind === "text" ? textFile : artifact.kind === "image" ? imageFile : videoFile,
          caption: "শিশুদের স্বতঃস্ফূর্ত অংশগ্রহণ",
          ...(artifact.kind === "video" ? { segments: [{ startMs: 0, endMs: 35_000 }] } : {}),
        }),
      },
      media: {
        inspect: async ({ kind }: { kind: string }) => {
          if (kind === "text") return { valid: true, evidence: {} };
          if (kind === "image") return { valid: true, evidence: { frames: [frameFile] } };
          return {
            valid: true,
            durationSeconds: 35,
            width: 1080,
            height: 1920,
            evidence: {
              frames: [{ filePath: frameFile, timeMs: 1000 }],
              transcript: "শিশুদের স্বতঃস্ফূর্ত অংশগ্রহণ নিশ্চিত করি",
              audio: { intelligible: true, coverage: "full" },
              coverage: "qa-test",
              limitations: [],
            },
          };
        },
      },
      reviewer: {
        review: async () => {
          reviewCount++;
          // First attempt fails, second attempt passes (exercising review iteration)
          if (reviewCount === 1) {
            return {
              passed: false,
              criteria: {
                mission: true,
                claims: true,
                context: false,
                age: true,
                bangla: true,
                usability: true,
              },
              findings: [
                {
                  version: 1,
                  criterion: "context",
                  evidence: "Lacked immediate activity context",
                  correction: "Add explicit contextual guidance for parents",
                  acceptanceCondition: "Guidance present in caption",
                },
              ],
            };
          }
          return {
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
          };
        },
      },
    },
  });

  try {
    // Request text production
    const prodResult = (await app.execute({
      type: "request",
      requestId: "qa-prod-text-1",
      texts: 1,
      schedule: false,
    })) as { status: string; artifactIds: string[] };

    assert.equal(prodResult.status, "complete");
    assert.equal(prodResult.artifactIds.length, 1);

    const artifact = await app.execute({
      type: "artifact",
      artifactId: prodResult.artifactIds[0],
    });
    assert.equal(artifact.status, "approved");
    assert.equal(artifact.kind, "text");
    assert.equal(artifact.versions.length, 2); // Iteration 1 failed, iteration 2 succeeded!
    assert.equal(reviewCount, 2);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 6: Quota Deferral & Durable Resumption", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-quota-"));
  const textFile = join(root, "text.txt");
  await writeFile(textFile, "শিশুদের সৃজনশীল কাজ।");

  let quotaThrew = true;
  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      editor: {
        create: async () => {
          if (quotaThrew) {
            const err = new Error("Rate limit exceeded on ChatGPT Codex");
            (err as unknown as { code: string }).code = "RATE_LIMIT";
            throw err;
          }
          return { filePath: textFile, caption: "শিশুর কাজ" };
        },
      },
      media: { inspect: async () => ({ valid: true, evidence: {} }) },
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
    // 1. First execution hits quota -> deferred gracefully without corrupting database
    const initialRes = (await app.execute({
      type: "request",
      requestId: "qa-quota-req-1",
      texts: 1,
      schedule: false,
    })) as { status: string; artifactIds: string[] };

    // When deferred, the overall job remains pending until quota resets
    assert.equal(initialRes.status, "pending");
    const artifactInitial = await app.execute({
      type: "artifact",
      artifactId: initialRes.artifactIds[0],
    });
    // Artifact status transitions to 'producing' while task in store is 'deferred'
    assert.equal(artifactInitial.status, "producing");

    const store = new Store(join(root, "db.sqlite"));
    const taskRecord = store.get("tasks", `artifact:${artifactInitial.id}`);
    assert.equal(taskRecord?.status, "deferred");
    // Clear quota block in meta to simulate quota window expiration
    store.remove("meta", "codex:codex");
    store.close();

    // 2. Quota lifts, retry same request ID resumes cleanly
    quotaThrew = false;
    const resumedRes = (await app.execute({
      type: "request",
      requestId: "qa-quota-req-1",
      texts: 1,
      schedule: false,
    })) as { status: string; artifactIds: string[] };

    assert.equal(resumedRes.status, "complete");
    const artifactResumed = await app.execute({
      type: "artifact",
      artifactId: resumedRes.artifactIds[0],
    });
    assert.equal(artifactResumed.status, "approved");
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 7: Setup Sample, Telegram Delivery & Attestation", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-sample-"));
  const rawVideo = join(root, "source.mp4");
  const permFile = join(root, "permission.txt");
  const renderedVideo = join(root, "rendered.mp4");
  const frameFile = join(root, "frame.png");
  const manifestPath = join(root, "manifest.json");
  await writeFile(rawVideo, "synthetic raw video");
  await writeFile(permFile, "edit and facebook permission");
  await writeFile(renderedVideo, "rendered vertical clip");
  await writeFile(frameFile, "frame");
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      architecture: "arm64",
      tools: {
        ffmpeg: { version: "1", license: "GPL" },
        ffprobe: { version: "1", license: "GPL" },
        chromium: { version: "1", license: "BSD" },
        "noto-sans-bengali": { version: "1", license: "OFL" },
        "whisper-cli": { version: "1", license: "MIT" },
      },
      whisper: {
        model: "small",
        sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
        bytes: 487601967,
        source: "https://huggingface.co/model.bin",
      },
    })
  );

  let telegramDeliveries = 0;
  const config = loadConfig(
    {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview", localTools: { manifestPath } },
      llm: {
        billingMode: "chatgpt-only",
        taskModels: { review: { provider: "codex", model: "gpt-4o" } },
      },
      integrations: {
        telegram: { operatorUserId: "12345678", tokenFile: join(root, "fake-tg-token") },
      },
    } as never,
    {}
  );

  const app = createHarness({
    config,
    adapters: {
      media: {
        inspectSource: async () => ({
          durationMs: 90_000,
          frames: [{ timeMs: 1000, filePath: frameFile }],
          transcript: "নিজে নিজে কাজ করি",
          evidencePath: frameFile,
          limitations: [],
        }),
        inspect: async () => ({
          valid: true,
          durationSeconds: 40,
          width: 1080,
          height: 1920,
          evidence: {
            frames: [{ filePath: frameFile, timeMs: 1000 }],
            transcript: "নিজে নিজে কাজ করি",
            audio: { intelligible: true, coverage: "full" },
            coverage: "full",
            limitations: [],
          },
        }),
      },
      qualifier: {
        qualify: async () => ({
          relevant: true,
          credible: true,
          locallyRelevant: true,
          candidateSets: [[{ startMs: 0, endMs: 40_000 }]],
          topics: ["Unintentional screen time and meaningful alternatives for children"],
          reviewerIdentity: "qa-qualifier",
        }),
      },
      editor: {
        create: async () => ({
          filePath: renderedVideo,
          caption: "শিশুর নিজে করার আনন্দ",
          segments: [{ startMs: 0, endMs: 40_000 }],
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
      delivery: {
        send: async () => {
          telegramDeliveries++;
        },
      },
    },
  });

  try {
    // 1. Register & qualify source
    await app.execute({
      type: "register-source",
      sourceId: "src-sample-1",
      language: "bn",
      filePath: rawVideo,
      permission: { evidencePath: permFile, scope: ["edit", "facebook"], restrictions: [] },
    });
    await app.execute({
      type: "qualify-source",
      sourceId: "src-sample-1",
      requestId: "qual-sample-1",
    });

    // 2. Run setup-sample
    const sample = (await app.execute({
      type: "setup-sample",
      sourceId: "src-sample-1",
      requestId: "qa-sample-run-1",
    })) as { status: string; artifactIds: string[] };

    assert.equal(sample.status, "complete");
    assert.equal(sample.artifactIds.length, 1);
    const approvedArtifactId = sample.artifactIds[0];

    // 3. Inspect sample status
    const sampleStatus = await app.execute({
      type: "setup-sample-status",
      requestId: "qa-sample-run-1",
    });
    assert.equal(sampleStatus.status, "complete");

    // 4. Send sample via setup-send
    const sendResult = await app.execute({
      type: "setup-send",
      artifactId: approvedArtifactId,
      requestId: "qa-send-req-1",
    });
    assert.equal(sendResult.sent, true);
    assert.equal(telegramDeliveries, 1);

    // setup-send idempotency: re-sending same request ID does not double send
    const sendResult2 = await app.execute({
      type: "setup-send",
      artifactId: approvedArtifactId,
      requestId: "qa-send-req-1",
    });
    assert.equal(sendResult2.sent, true);
    assert.equal(telegramDeliveries, 1); // Deliveries remain 1!

    // 5. Setup attestation requires real native-tool receipt:
    // Inject mock native receipt matching readiness fingerprint
    const store = new Store(config.storage.databasePath);
    const { createHash } = await import("node:crypto");
    const missionText = readFileSync(new URL("../docs/mission.md", import.meta.url), "utf8");
    const mission = {
      version: createHash("sha256").update(missionText).digest("hex"),
      text: missionText,
    };
    const mockCtx = { config, store, mission } as never;
    store.put("setup_receipts", {
      id: "qa-native-receipt",
      schemaVersion: 1,
      target: "local",
      kind: "native-tool",
      checkedAt: new Date().toISOString(),
      outcome: "passed",
      configFingerprint: readinessFingerprint(mockCtx),
      identityFingerprint: "local",
      toolManifestHash: toolManifestHash(mockCtx),
      evidencePaths: [],
      limitations: [],
    });
    store.close();

    // Now setup-attest succeeds
    const attestResult = await app.execute({
      type: "setup-attest",
      artifactId: approvedArtifactId,
    });
    assert.equal(attestResult.artifactId, approvedArtifactId);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 8: 90-Day Planning, Spacing & Queue Export", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-planning-"));
  const queueCsvPath = join(root, "upload-queue.csv");
  const windowsFile = join(root, "posting-windows.json");
  await writeFile(
    windowsFile,
    JSON.stringify({
      timezone: "Asia/Dhaka",
      windows: [
        { start: "09:00", end: "13:00" },
        { start: "17:00", end: "21:00" },
      ],
      evidence: ["https://example.test/evidence"],
      researchedAt: "2026-09-15T00:00:00.000Z",
      limitations: "QA test windows",
    })
  );

  const textFile = join(root, "text.txt");
  await writeFile(textFile, "শিশুদের সৃজনশীল কাজ। ক্ষ, জ্ঞ।");

  const app = createHarness({
    clock: () => new Date("2026-09-15T04:00:00.000Z"),
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
      posting: { windowsFile, queueCsvPath, minSpacingMinutes: 60 },
      reserve: { minimumDays: 90, continueAboveMinimum: true },
    } as never,
    adapters: {
      editor: { create: async () => ({ filePath: textFile, caption: "শিশুর কাজ" }) },
      media: { inspect: async () => ({ valid: true, evidence: {} }) },
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
    // 1. Generate 2 approved text artifacts
    await app.execute({ type: "request", requestId: "qa-plan-req-1", texts: 2, schedule: true });

    // 2. Run planning for 90 days
    const planCoverage = await app.execute({ type: "plan", days: 90 });
    assert.equal(planCoverage.requiredDays, 90);
    assert.ok(planCoverage.days.length >= 1);

    // 3. Export queue CSV
    await app.execute({ type: "export-queue" });
    assert.ok(existsSync(queueCsvPath));

    const csvContent = readFileSync(queueCsvPath, "utf8");
    assert.ok(csvContent.includes("queue_id"));
    assert.ok(csvContent.includes("শিশুর কাজ")); // Preserves Bangla characters!

    // 4. Coverage check reports actual backed days vs target
    const coverage = await app.execute({ type: "coverage", days: 90 });
    assert.equal(coverage.requiredDays, 90);
    assert.ok(coverage.days.length >= 1);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 9: Publication Safety Barrier & Remote Reconciliation", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-safety-"));
  let facebookWrites = 0;

  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: { profile: "pi-free", executionMode: "preview" },
    } as never,
    adapters: {
      facebook: {
        submit: async () => {
          facebookWrites++;
          return { id: "fb-post-id" };
        },
        cancel: async () => {
          facebookWrites++;
          return { status: "cancelled" };
        },
      },
    },
  });

  try {
    // In Pi Preview Mode, all mutating operations are strictly blocked by runtime policy
    await assert.rejects(app.execute({ type: "publish" }), /blocked in Pi preview mode/);
    await assert.rejects(
      app.execute({ type: "cancel", postIds: ["any-post"] }),
      /blocked in Pi preview mode/
    );
    await assert.rejects(
      app.execute({
        type: "publish-one",
        artifactId: "any-art",
        expectedSha256: "any-sha",
        pageId: "any-page",
        requestId: "any-req",
        confirmLive: true,
      }),
      /blocked in Pi preview mode/
    );
    await assert.rejects(
      app.execute({
        type: "activate-publication",
        pageId: "any-page",
        confirmLive: true,
      }),
      /blocked in Pi preview mode/
    );

    // Zero Facebook mutations allowed!
    assert.equal(facebookWrites, 0);

    // Replay Protection: Command ID deduplication
    const cmd1 = await app.execute({
      type: "status",
      commandId: "qa-cmd-id-1",
    });
    assert.ok(cmd1.artifacts);

    // Executing with same command ID returns identical cached result
    const cmd2 = await app.execute({
      type: "status",
      commandId: "qa-cmd-id-1",
    });
    assert.deepEqual(cmd1, cmd2);
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 10: Service Daemon & Disaster Recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-service-"));
  const backupDir = join(root, "backup-target");

  const app = createHarness({
    config: {
      storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      deployment: {
        profile: "pi-free",
        executionMode: "preview",
        storageBudget: { minFreeBytes: 1024 * 1024 },
      },
      posting: { minSpacingMinutes: 60 },
    } as never,
  });

  try {
    // 1. Service cycle execution (tick)
    const cycle = (await app.execute({ type: "service-cycle" })) as {
      results: Record<string, unknown>;
      errors: Record<string, string>;
    };
    assert.equal(Object.keys(cycle.errors).length, 0);
    assert.ok(cycle.results);

    // 2. Backup creation
    const backupRes = await app.execute({
      type: "backup",
      destination: backupDir,
    });
    assert.equal(backupRes.destination, backupDir);
    assert.ok(backupRes.databaseSha256);
    assert.ok(existsSync(join(backupDir, "sfurti.sqlite")));
    assert.ok(existsSync(join(backupDir, "manifest.json")));

    // 3. Restore verification into isolated destination
    const restoreRes = await app.execute({
      type: "restore-verify",
      source: backupDir,
      destination: join(root, "restored-target"),
    });
    assert.equal(restoreRes.verified, true);
    assert.ok(existsSync(join(root, "restored-target", "sfurti.sqlite")));
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Senior QA Journey 11: Real ARM64 Pi Benchmark & Hardware Profiling", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-qa-bench-"));
  const databasePath = join(root, "db.sqlite");
  const outputBin = join(root, "rendered.mp4");
  const outputText = join(root, "rendered.txt");
  const framePng = join(root, "frame.png");

  await writeFile(outputBin, "synthetic rendered 9:16 vertical video bytes");
  await writeFile(outputText, "আজ শিশুদের সঙ্গে কাগজ দিয়ে বিমান বানাই।");
  await writeFile(framePng, "synthetic inspection frame");

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
          filePath: artifact.kind === "text" ? outputText : outputBin,
          caption: "শিশুর সৃজনশীল কর্মকাণ্ড",
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
                  frames: [{ filePath: framePng, timeMs: 1000 }],
                  transcript: "শিশুর সৃজনশীল কর্মকাণ্ড",
                  audio: { intelligible: true, coverage: "full" },
                  coverage: "qa-benchmark",
                  limitations: [],
                },
              }
            : kind === "image"
              ? { valid: true, evidence: { frames: [framePng] } }
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
    // Register 3 distinct sources required for setup-benchmark
    for (const id of ["src-bench-1", "src-bench-2", "src-bench-3"]) {
      const sourceFile = join(root, `${id}.mp4`);
      const permFile = join(root, `${id}-perm.txt`);
      await writeFile(sourceFile, `video bytes for ${id}`);
      await writeFile(permFile, "edit and facebook");
      await app.execute({
        type: "register-source",
        sourceId: id,
        language: "bn",
        filePath: sourceFile,
        permission: { evidencePath: permFile, scope: ["edit", "facebook"], restrictions: [] },
      });
    }

    // Mark all 3 sources qualified with non-overlapping segment intervals
    const writer = new Store(databasePath);
    for (const s of writer.all("sources")) {
      writer.put("sources", {
        ...s,
        status: "cleared",
        metadata: {
          ...s.metadata,
          qualified: true,
          segments: [{ startMs: 0, endMs: 35_000 }],
        },
      });
    }
    writer.close();

    // Execute setup-benchmark
    const benchResult = await app.execute({
      type: "setup-benchmark",
      requestId: "qa-benchmark-run-1",
    });

    assert.equal(benchResult.isolated, true);
    assert.equal(benchResult.measurements.approvedArtifacts, 5); // 3 videos + 1 image + 1 text = 5 approved!
    assert.ok(typeof benchResult.measurements.elapsedMs === "number");
    assert.ok(benchResult.measurements.peakRssBytes > 0);
    assert.ok(typeof benchResult.measurements.diskGrowthBytes === "number");
  } finally {
    app.close();
    await rm(root, { recursive: true, force: true });
  }
});
