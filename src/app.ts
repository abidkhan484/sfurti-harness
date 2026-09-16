import { randomUUID, createHash } from "node:crypto";
import { readFileSync, mkdirSync, statfsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Store, type RecordData } from "./store.ts";
import { loadConfig, type Config } from "./config.ts";
import { today, type Command, type Context } from "./types.ts";
import { parseSetupReceipt } from "./deployment/contracts.ts";
import { assertSourcePermission, fileIntegrity } from "./domain.ts";

export interface HarnessOptions {
  config?: Partial<Config> | Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapters?: Record<string, any>;
  clock?: () => Date;
  random?: () => number;
}
export function createHarness(options: HarnessOptions = {}) {
  const config = loadConfig(options.config, options.env);
  const store = new Store(config.storage.databasePath);
  mkdirSync(config.storage.mediaDirectory, { recursive: true });
  const missionText = readFileSync(new URL("../docs/mission.md", import.meta.url), "utf8");
  const adapters = {
    storage: {
      freeBytes: async () => {
        const fs = statfsSync(config.storage.mediaDirectory);
        return fs.bavail * fs.bsize;
      },
    },
    ...options.adapters,
  };
  const ctx: Context = {
    store,
    config,
    adapters,
    now: options.clock ?? (() => new Date()),
    random: options.random ?? Math.random,
    id: randomUUID,
    mission: { text: missionText, version: createHash("sha256").update(missionText).digest("hex") },
    async notify(event) {
      const { enqueueNotification } = await import("./notifications.ts");
      await enqueueNotification(ctx, event);
    },
  };
  const guardedFacebook = (adapters as Record<string, unknown>).facebook as
    | {
        setAuthorizationVerifier?: (
          verify: (authorization: Record<string, unknown>) => void
        ) => void;
        setJournal?: (journal: Store) => void;
      }
    | undefined;
  guardedFacebook?.setJournal?.(store);
  const guardedDelivery = (adapters as Record<string, unknown>).delivery as
    { setJournal?: (journal: Store) => void } | undefined;
  guardedDelivery?.setJournal?.(store);
  guardedFacebook?.setAuthorizationVerifier?.((authorization) => {
    const receipt = store.get(
      "operation_journals",
      `publication-authorization:${authorization.requestId}`
    );
    if (
      !receipt ||
      !["in-flight", "continuous"].includes(receipt.status as string) ||
      receipt.operation !== authorization.operation ||
      receipt.pageId !== authorization.pageId ||
      receipt.postId !== authorization.postId ||
      receipt.artifactId !== authorization.artifactId ||
      receipt.artifactHash !== authorization.artifactHash ||
      receipt.artifactVersion !== authorization.artifactVersion ||
      receipt.configFingerprint !== authorization.configFingerprint ||
      receipt.configFingerprint !== publicationIdentity(authorization.pageId as string)
    )
      throw new Error(
        "Facebook mutation authorization is missing, stale, or does not match the selected operation"
      );
  });
  function safeConfig() {
    const value = structuredClone(config);
    delete value.integrations;
    // Concrete secret file references live in integrations and must not be snapshotted.
    return value;
  }
  function publicationIdentity(pageId: string) {
    // Never include integration secrets: identity deliberately covers only
    // fields which make an earlier operator authorization unsafe to reuse.
    const facebook = config.integrations?.facebook as Record<string, unknown> | undefined;
    return createHash("sha256")
      .update(
        JSON.stringify({
          pageId,
          graphApiVersion: facebook?.graphApiVersion,
          executionMode: config.deployment?.executionMode,
          posting: config.posting,
          productionMode: config.productionMode,
          research: config.research.enabled,
        })
      )
      .digest("hex");
  }
  function configuredPageId() {
    const facebook = config.integrations?.facebook as Record<string, unknown> | undefined;
    return facebook && typeof facebook.pageId === "string" ? facebook.pageId : undefined;
  }
  function activation() {
    const value = store.get("meta", "publication-activation");
    if (
      !value?.active ||
      value.pageId !== configuredPageId() ||
      value.configFingerprint !== publicationIdentity(value.pageId as string)
    )
      return undefined;
    return value;
  }
  function authorization(
    post: Record<string, unknown>,
    operation: "submit" | "cancel",
    requestId: string,
    oneShot = false
  ) {
    const artifact = store.get("artifacts", String(post.artifactId));
    const version = artifact?.versions?.at(-1);
    if (!artifact || !version || !post || !eligiblePublication(post, artifact))
      throw new Error(
        "Publication artifact approval, integrity, or permission is no longer current"
      );
    const pageId = oneShot ? undefined : (activation()?.pageId as string | undefined);
    if (!pageId && !oneShot) throw new Error("Continuous publication is not activated");
    return {
      operation,
      requestId,
      pageId,
      postId: post.id,
      artifactId: artifact.id,
      artifactVersion: version.version ?? version.id ?? 0,
      artifactHash: version.integrity?.sha256,
      configFingerprint: publicationIdentity(pageId ?? ""),
    };
  }
  function eligiblePublication(post: Record<string, unknown>, artifact: Record<string, unknown>) {
    // Planning repeats the same integrity/permission gate at dispatch; this
    // fast path ensures authorization is never minted for a stale artifact.
    const version = (artifact.versions as Record<string, unknown>[])?.at(-1);
    if (
      artifact.status !== "approved" ||
      !version?.integrity ||
      typeof artifact.filePath !== "string" ||
      typeof post.scheduledAt !== "string"
    )
      return false;
    try {
      fileIntegrity(artifact.filePath, version.integrity, true);
      for (const sourceId of Array.isArray(artifact.sourceIds) ? artifact.sourceIds : [])
        assertSourcePermission(store.get("sources", sourceId), ctx.now(), {
          requireStoredIntegrity: true,
        });
      return true;
    } catch {
      return false;
    }
  }
  function snapshot() {
    return store.transaction(() => {
      const date = today(ctx);
      const previous = store.get("plans", date);
      if (previous?.snapshotSealed) return previous;
      return store.put("plans", {
        ...previous,
        id: date,
        date,
        config: safeConfig(),
        snapshotSealed: true,
        createdAt: ctx.now().toISOString(),
      });
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function dispatch(command: Command): Promise<any> {
    if (!command || typeof command.type !== "string") throw new Error("A command type is required");
    const piPreview =
      config.deployment?.profile === "pi-free" && config.deployment.executionMode === "preview";
    const publicationActive = () => !!activation();
    if (
      piPreview &&
      ["publish", "cancel", "publish-one", "activate-publication"].includes(command.type)
    )
      throw new Error("Publication mutation is blocked in Pi preview mode");
    switch (command.type) {
      case "service-cycle": {
        const { serviceCycle } = await import("./service.ts");
        return serviceCycle(ctx, execute);
      }
      case "activate-publication": {
        if (
          config.deployment?.profile !== "pi-free" ||
          command.confirmLive !== true ||
          typeof command.pageId !== "string" ||
          command.pageId !== configuredPageId()
        )
          throw new Error("Live publication activation requires explicit Page confirmation");
        const { maintenance } = await import("./maintenance.ts");
        const readiness = await maintenance(ctx, { type: "doctor" });
        if (!readiness.ready)
          throw new Error("Live publication activation requires current Pi readiness");
        return store.put("meta", {
          id: "publication-activation",
          active: true,
          pageId: command.pageId,
          configFingerprint: publicationIdentity(command.pageId),
          activatedAt: ctx.now().toISOString(),
        });
      }
      case "deactivate-publication":
        return store.put("meta", {
          id: "publication-activation",
          active: false,
          reason: String(command.reason ?? "operator"),
          deactivatedAt: ctx.now().toISOString(),
        });
      case "publish-one": {
        if (
          config.deployment?.profile !== "pi-free" ||
          command.confirmLive !== true ||
          typeof command.requestId !== "string"
        )
          throw new Error(
            "publish-one requires explicit selected live confirmation and request ID"
          );
        const artifact = store.get("artifacts", command.artifactId as string);
        const integrity = artifact?.versions?.at(-1)?.integrity;
        if (
          !artifact ||
          typeof command.pageId !== "string" ||
          command.pageId !== configuredPageId() ||
          command.expectedSha256 !== integrity?.sha256
        )
          throw new Error("Selected artifact, Page, or approved hash is not current");
        const post = store
          .all("posts")
          .find((p) => p.artifactId === artifact.id && p.status === "planned");
        if (!post) throw new Error("Selected artifact has no planned publication");
        const id = `publication-authorization:${command.requestId}`;
        const prior = store.get<Record<string, unknown>>("operation_journals", id);
        if (prior) {
          const priorStatus = prior.status;
          if (priorStatus === "consumed")
            throw new Error(
              "Selected publication authorization was already used. Check the published post before retrying."
            );
          throw new Error(
            `Selected publication authorization is ${priorStatus} (requestId: ${command.requestId}). ` +
              "Use a new requestId to retry with a fresh authorization."
          );
        }
        const bound = authorization(post, "submit", command.requestId, true);
        const selected = {
          ...bound,
          pageId: command.pageId,
          configFingerprint: publicationIdentity(command.pageId),
        };
        store.put("operation_journals", {
          id,
          ...selected,
          status: "in-flight",
          authorizedAt: ctx.now().toISOString(),
        });
        const { planning } = await import("./planning.ts");
        try {
          const result = await planning(ctx, {
            type: "publish",
            postIds: [post.id],
            publicationAuthorization: selected,
          });
          store.put("operation_journals", {
            id,
            ...store.get("operation_journals", id),
            status: "consumed",
            consumedAt: ctx.now().toISOString(),
          });
          return result;
        } catch (error) {
          store.put("operation_journals", {
            id,
            ...store.get("operation_journals", id),
            status: "held",
            heldAt: ctx.now().toISOString(),
            lastError: String(error),
          });
          throw error;
        }
      }
      case "drain-notifications": {
        const { drainNotifications } = await import("./notifications.ts");
        return drainNotifications(ctx);
      }
      case "config":
        return safeConfig();
      case "daily-snapshot":
        return snapshot();
      case "status":
        return Object.fromEntries(
          [
            "artifacts",
            "posts",
            "plans",
            "sources",
            "jobs",
            "tasks",
            "meta",
            "notifications",
            "reviews",
            "segments",
            "keywords",
            "matches",
            "recommendations",
            "qualifications",
            "telegram_updates",
            "service_tasks",
          ].map((name) => [name, store.all(name)])
        );
      case "pending-sources":
        return store.all("sources").filter((s) => !s.permission);
      case "artifact": {
        const artifact = store.get("artifacts", command.artifactId);
        if (!artifact) throw new Error("Artifact not found");
        return artifact;
      }
      case "storage":
      case "cleanup-preview": {
        const files: Array<{ path: string; bytes: number }> = [];
        function walk(path: string) {
          for (const entry of readdirSync(path, { withFileTypes: true })) {
            const file = join(path, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.isFile()) files.push({ path: file, bytes: statSync(file).size });
          }
        }
        walk(config.storage.mediaDirectory);
        const fs = statfsSync(config.storage.mediaDirectory);
        return {
          files,
          totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
          freeBytes: fs.bavail * fs.bsize,
          deletionEnabled: false,
        };
      }
      case "doctor":
      case "backup":
      case "restore-verify": {
        const { maintenance } = await import("./maintenance.ts");
        return maintenance(ctx, command);
      }
      case "request":
      case "tick": {
        const coordinator = await import("./coordinator.ts");
        return command.type === "request"
          ? coordinator.request(ctx, command, execute)
          : coordinator.tick(ctx, command, execute);
      }
      case "discover":
      case "qualify-source":
      case "intake-scan":
      case "register-source":
      case "produce":
      case "retry-artifact": {
        if (command.type === "intake-scan") {
          const { scanInbox } = await import("./intake/scan.ts");
          return scanInbox(ctx, command.submissionId);
        }
        const { production } = await import("./production.ts");
        if (command.origin === "daily") {
          const plan = snapshot();
          return production(
            { ...ctx, config: plan.config },
            { ...command, date: plan.date, topic: plan.config.topic }
          );
        }
        return production(ctx, command);
      }
      case "plan":
      case "coverage":
      case "publish":
      case "reconcile":
      case "cancel":
      case "pause":
      case "export-queue":
      case "rebuild-plans":
      case "schedule-custom": {
        if (
          command.type === "publish" &&
          config.deployment?.profile === "pi-free" &&
          !publicationActive()
        )
          throw new Error("Continuous publication is not activated");
        const { planning } = await import("./planning.ts");
        if (
          config.deployment?.profile === "pi-free" &&
          ["publish", "cancel"].includes(command.type)
        ) {
          const posts = store
            .all("posts")
            .filter((p) => !command.postIds || command.postIds.includes(p.id));
          if (command.type === "cancel" && posts.length !== 1)
            throw new Error("Continuous cancellation requires one selected post");
          const selectedPosts =
            command.type === "publish"
              ? posts.filter((p) => p.status === "planned" && !p.cancelRequested)
              : posts;
          const outcomes: unknown[] = [];
          for (const selectedPost of selectedPosts) {
            const bound = authorization(
              selectedPost,
              command.type === "cancel" ? "cancel" : "submit",
              command.requestId ?? `continuous:${selectedPost.id}:${command.type}`
            );
            store.put("operation_journals", {
              id: `publication-authorization:${bound.requestId}`,
              ...bound,
              status: "continuous",
              createdAt: ctx.now().toISOString(),
            });
            outcomes.push(
              await planning(ctx, {
                ...command,
                postIds: [selectedPost.id],
                publicationAuthorization: bound,
              })
            );
          }
          return { outcomes };
        }
        return planning(ctx, command);
      }
      case "setup-posting-windows": {
        const { existsSync, mkdirSync, writeFileSync } = await import("node:fs");
        const { dirname } = await import("node:path");
        const { postingWindowsExample } = await import("./deployment/posting-windows.ts");
        const path = config.posting.windowsFile;
        if (existsSync(path)) return { path, created: false };
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(postingWindowsExample, null, 2) + "\n", { mode: 0o600 });
        return { path, created: true };
      }
      case "setup-init": {
        if (config.deployment?.profile !== "pi-free")
          throw new Error("setup-init is available only for the Pi profile");
        const { existsSync, mkdirSync, writeFileSync } = await import("node:fs");
        const { dirname } = await import("node:path");
        const { postingWindowsExample } = await import("./deployment/posting-windows.ts");
        const windowsPath = config.posting.windowsFile;
        const inboxPath = config.deployment.intake.path;
        const created: string[] = [];
        mkdirSync(inboxPath, { recursive: true, mode: 0o700 });
        if (!existsSync(windowsPath)) {
          mkdirSync(dirname(windowsPath), { recursive: true, mode: 0o700 });
          writeFileSync(windowsPath, JSON.stringify(postingWindowsExample, null, 2) + "\n", {
            mode: 0o600,
          });
          created.push(windowsPath);
        }
        return {
          created,
          inboxPath,
          configTemplate: "config/harness.pi-free.example.json",
          permissionTemplate: "config/permission-manifest.example.json",
          missingHumanSteps: [
            "Copy and edit the non-secret Pi configuration without embedding tokens.",
            "Create private token files and complete local ChatGPT login outside this command.",
            "Replace provisional posting-window evidence with actual operator/Page evidence.",
          ],
        };
      }
      case "setup-attest": {
        if (typeof command.artifactId !== "string")
          throw new Error("setup-attest requires an artifactId");
        const { sampleIsCurrent, readinessFingerprint, toolManifestHash } =
          await import("./deployment/readiness.ts");
        const sample = sampleIsCurrent(ctx, command.artifactId);
        if (!sample.ok) throw new Error(`setup-attest ${sample.reason}`);
        const nativeReceipt = store.all("setup_receipts").some((value) => {
          try {
            const receipt = parseSetupReceipt(value);
            return (
              receipt.target === "local" &&
              receipt.kind === "native-tool" &&
              receipt.outcome === "passed" &&
              receipt.configFingerprint === readinessFingerprint(ctx) &&
              receipt.toolManifestHash === toolManifestHash(ctx)
            );
          } catch {
            return false;
          }
        });
        if (!nativeReceipt)
          throw new Error("setup-attest requires current real native-tool receipt");
        const { fileIntegrity } = await import("./domain.ts");
        fileIntegrity(sample.artifact.filePath, sample.version.integrity, true);
        return store.put("meta", {
          id: "setup-attestation",
          artifactId: sample.artifact.id,
          artifactSha256: sample.version.integrity.sha256,
          artifactVersion: sample.version.number,
          configFingerprint: readinessFingerprint(ctx),
          verifiedAt: ctx.now().toISOString(),
        });
      }
      case "setup-sample-status": {
        if (typeof command.requestId !== "string")
          throw new Error("setup-sample-status requires requestId");
        const job = store.get("jobs", `setup-sample:${command.requestId}`);
        const artifacts =
          (job?.artifactIds as string[] | undefined)
            ?.map((id: string) => store.get("artifacts", id))
            .filter(Boolean) ?? [];
        return job
          ? {
              requestId: command.requestId,
              status: job.status,
              stage: (artifacts.at(-1) as Record<string, unknown> | undefined)?.stage ?? job.status,
              reason: (artifacts.at(-1) as Record<string, unknown> | undefined)?.lastError,
              artifacts: artifacts.map((a) => ({
                id: (a as Record<string, unknown>).id,
                status: (a as Record<string, unknown>).status,
                path: (a as Record<string, unknown>).filePath,
              })),
            }
          : { requestId: command.requestId, status: "missing" };
      }
      case "setup-send": {
        if (typeof command.artifactId !== "string" || typeof command.requestId !== "string")
          throw new Error("setup-send requires artifactId and requestId");
        const artifact = store.get("artifacts", command.artifactId);
        if (!artifact || artifact.status !== "approved" || !artifact.filePath)
          throw new Error("setup-send requires one approved selected artifact");
        if (!ctx.adapters.delivery) throw new Error("Private Telegram delivery is not configured");
        const version = artifact.versions?.at(-1);
        const { fileIntegrity } = await import("./domain.ts");
        fileIntegrity(artifact.filePath, version?.integrity, true);
        const journalId = `setup-send:${command.requestId}`;
        const previous = store.get("operation_journals", journalId);
        const requestFingerprint = `${artifact.id}:${version.integrity.sha256}`;
        if (previous && previous.requestFingerprint !== requestFingerprint)
          throw new Error("setup-send request ID belongs to a different selected artifact");
        if (previous?.phase === "confirmed") return previous.result;
        if (previous?.uncertainty)
          throw new Error(
            "setup-send is held for Telegram reconciliation; do not resend automatically"
          );
        store.put("operation_journals", {
          id: journalId,
          operationId: journalId,
          destinationIdentity: "configured-private-operator",
          selectedArtifactHash: version.integrity.sha256,
          phase: "intent",
          requestFingerprint,
          attempt: (previous?.attempt ?? 0) + 1,
          remoteIds: [],
          lastConfirmedState: "none",
          uncertainty: false,
        });
        try {
          await ctx.adapters.delivery.send(
            { type: "setup-send", artifactId: artifact.id, artifactPaths: [artifact.filePath] },
            { idempotencyKey: journalId }
          );
        } catch (error) {
          store.put("operation_journals", {
            ...store.get("operation_journals", journalId),
            id: journalId,
            phase: "unknown",
            uncertainty: true,
            lastConfirmedState: "unknown",
            lastError: String(error),
          });
          throw error;
        }
        const result = { artifactId: artifact.id, queued: false, sent: true };
        store.put("operation_journals", {
          ...store.get("operation_journals", journalId),
          id: journalId,
          phase: "confirmed",
          uncertainty: false,
          lastConfirmedState: "sent",
          result,
        });
        const { readinessFingerprint } = await import("./deployment/readiness.ts");
        store.put("setup_receipts", {
          id: `setup-send:${command.requestId}`,
          schemaVersion: 1,
          target: "telegram",
          kind: "telegram-send",
          checkedAt: ctx.now().toISOString(),
          outcome: "passed",
          configFingerprint: readinessFingerprint(ctx),
          identityFingerprint: "telegram",
          artifactId: artifact.id,
          artifactVersion: String(version.number ?? 0),
          artifactSha256: version.integrity.sha256,
          evidencePaths: [],
          limitations: [],
        });
        return result;
      }
      case "setup-probe": {
        if (
          !["codex", "search", "facebook"].includes(command.target) ||
          (command.requestId !== undefined && typeof command.requestId !== "string")
        )
          throw new Error("setup-probe requires target codex/search/facebook");
        const probeRequestId = command.requestId ?? ctx.id();
        const adapter =
          command.target === "facebook"
            ? ctx.adapters.facebook
            : command.target === "search"
              ? ctx.adapters.discovery
              : ctx.adapters.codex;
        if (!adapter) throw new Error(`setup-probe ${command.target} adapter is unavailable`);
        const outcome: "passed" | "failed" = await (async () => {
          try {
            if (command.target === "facebook" && typeof adapter.probe === "function") {
              await adapter.probe();
            } else if (command.target === "codex" && typeof adapter.probe === "function") {
              const model = Object.values(config.llm.taskModels)[0]?.model;
              if (typeof model !== "string") throw new Error("Codex has no configured task model");
              await adapter.probe(model);
            } else if (typeof adapter.probe === "function") {
              await adapter.probe();
            } else throw new Error("adapter has no explicit bounded probe");
            return "passed";
          } catch {
            return "failed";
          }
        })();
        const { readinessFingerprint } = await import("./deployment/readiness.ts");
        const kind =
          command.target === "facebook"
            ? "page-read"
            : command.target === "codex"
              ? "codex-inference"
              : "search";
        return store.put("setup_receipts", {
          id: `probe:${command.target}:${probeRequestId}`,
          schemaVersion: 1,
          target: command.target,
          kind,
          checkedAt: ctx.now().toISOString(),
          outcome,
          configFingerprint: readinessFingerprint(ctx),
          identityFingerprint: command.target,
          evidencePaths: [],
          limitations:
            outcome === "passed" ? [] : ["Explicit probe did not establish a connection"],
        });
      }
      case "setup-sample": {
        if (typeof command.sourceId !== "string" || typeof command.requestId !== "string")
          throw new Error("setup-sample requires sourceId and requestId");
        const setupJobId = `setup-sample:${command.requestId}`;
        const previous = store.get("jobs", setupJobId);
        if (previous && previous.command?.sourceId !== command.sourceId)
          throw new Error("setup-sample request ID belongs to a different source");
        const source = store.get("sources", command.sourceId);
        if (
          !source ||
          source.status !== "cleared" ||
          !source.metadata?.qualified ||
          !Array.isArray(source.metadata.segments) ||
          !source.metadata.segments.length
        )
          throw new Error("setup-sample requires one cleared qualified source with intervals");
        const { assertSourcePermission } = await import("./domain.ts");
        assertSourcePermission(source, ctx.now(), { requireStoredIntegrity: true });
        const candidateSets: Array<Array<{ startMs: number; endMs: number }>> = Array.isArray(
          source.metadata.candidateSets
        )
          ? source.metadata.candidateSets
          : [source.metadata.segments];
        const used = store
          .all("artifacts")
          .filter((artifact) => artifact.sourceIds?.includes(source.id))
          .flatMap((artifact) => artifact.segments ?? []);
        const selected = candidateSets.find(
          (set: Array<{ startMs: number; endMs: number }>) =>
            Array.isArray(set) &&
            set.length &&
            !set.some((segment: { startMs: number; endMs: number }) =>
              used.some((other) => segment.startMs < other.endMs && other.startMs < segment.endMs)
            )
        );
        if (!selected) throw new Error("setup-sample has no unused qualified interval set");
        const coordinator = await import("./coordinator.ts");
        return coordinator.request(
          ctx,
          {
            type: "request",
            requestId: `setup-sample:${command.requestId}`,
            videos: 1,
            sourceId: source.id,
            segments: selected,
            topic: source.metadata.topic ?? config.topic,
            schedule: false,
          },
          execute
        );
      }
      case "setup-benchmark": {
        if (typeof command.requestId !== "string")
          throw new Error("setup-benchmark requires requestId");
        if (
          config.deployment?.profile !== "pi-free" ||
          config.deployment.executionMode !== "preview"
        )
          throw new Error("setup-benchmark is available only in Pi preview mode");
        const benchmarkId = `setup-benchmark:${command.requestId}`;
        const existingBenchmark = store.get("meta", benchmarkId);
        if (existingBenchmark?.result?.status === "complete") return existingBenchmark;
        const qualifiedSources = store
          .all("sources")
          .filter(
            (source) =>
              source.status === "cleared" &&
              source.metadata?.qualified === true &&
              Array.isArray(source.metadata?.segments) &&
              source.metadata.segments.length
          );
        if (new Set(qualifiedSources.map((source) => source.id)).size < 3)
          throw new Error("setup-benchmark requires three distinct cleared qualified sources");
        const coordinator = await import("./coordinator.ts");
        const startedAt = ctx.now().toISOString();
        const startedMs = ctx.now().getTime();
        const before = statfsSync(config.storage.mediaDirectory);
        const beforeFreeBytes = before.bavail * before.bsize;
        const memoryBefore = process.memoryUsage().rss;
        const activeId = `setup-benchmark-active:${command.requestId}`;
        store.put("meta", {
          id: "setup-benchmark-active",
          activeId,
          requestId: command.requestId,
          startedAt,
          // A crashed process cannot pause normal work indefinitely.
          leaseUntil: new Date(ctx.now().getTime() + config.limits.taskTimeoutMs).toISOString(),
        });
        let result: RecordData;
        try {
          result = (await coordinator.request(
            ctx,
            {
              type: "request",
              requestId: `setup-benchmark:${command.requestId}`,
              videos: 3,
              images: 1,
              texts: 1,
              topic: config.topic,
              schedule: false,
              isolatedBenchmark: true,
              benchmarkSourceIds: qualifiedSources.slice(0, 3).map((source) => source.id),
            },
            execute
          )) as RecordData;
        } finally {
          if (store.get("meta", "setup-benchmark-active")?.activeId === activeId)
            store.remove("meta", "setup-benchmark-active");
        }
        const after = statfsSync(config.storage.mediaDirectory);
        const artifacts: RecordData[] = ((result.artifactIds ?? []) as string[])
          .map((id: string) => store.get("artifacts", id))
          .filter((artifact): artifact is RecordData => artifact !== undefined);
        const stages = Array.isArray(result.benchmarkStages) ? result.benchmarkStages : [];
        const outputBytes = stages.reduce(
          (total: number, stage: RecordData) => total + Number(stage.outputBytes ?? 0),
          0
        );
        const minFreeBytes = Math.max(
          config.limits.minFreeBytes,
          config.deployment.storageBudget.minFreeBytes
        );
        return store.put("meta", {
          id: benchmarkId,
          requestId: command.requestId,
          isolated: true,
          startedAt,
          completedAt: ctx.now().toISOString(),
          result,
          measurements: {
            elapsedMs: Math.max(0, ctx.now().getTime() - startedMs),
            peakRssBytes: Math.max(memoryBefore, process.memoryUsage().rss),
            diskGrowthBytes: Math.max(0, beforeFreeBytes - after.bavail * after.bsize),
            approvedArtifacts: artifacts.filter((artifact) => artifact.status === "approved")
              .length,
            deferredArtifacts: artifacts.filter((artifact) => artifact.status === "deferred")
              .length,
            failedArtifacts: artifacts.filter((artifact) => artifact.status === "failed").length,
            stages,
            quotaRecords: stages.filter((stage: RecordData) => stage.quota !== "not-deferred"),
            storageProjection: {
              packageOutputBytes: outputBytes,
              freeBytesAfter: after.bavail * after.bsize,
              protectedFreeBytes: minFreeBytes,
              additionalPackagesAtObservedSize:
                outputBytes > 0
                  ? Math.max(
                      0,
                      Math.floor((after.bavail * after.bsize - minFreeBytes) / outputBytes)
                    )
                  : null,
            },
          },
          limitations: [
            "Preview benchmark runs only its isolated 3/1/1 custom job, is not daily coverage, and requires three cleared qualified sources for video success.",
          ],
        });
      }
      default:
        throw new Error(`Unknown command: ${command.type}`);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function execute(command: Command): Promise<any> {
    if (!command.commandId) return dispatch(command);
    if (typeof command.commandId !== "string" || command.commandId.length > 200)
      throw new Error("Invalid command identity");
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const id = `command:${command.commandId}`;
    const existing = store.transaction(() => {
      const previous = store.get("tasks", id);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new Error("Identity belongs to a different command");
        return previous;
      }
      store.put("tasks", {
        id,
        fingerprint,
        status: "running",
        createdAt: ctx.now().toISOString(),
      });
      return undefined;
    });
    if (existing) {
      if (existing.status === "complete") {
        if (command.commandId.startsWith("telegram:"))
          await ctx.notify({
            type: "command-result",
            commandId: command.commandId,
            result: existing.result,
          });
        return existing.result;
      }
      if (existing.status === "failed") throw new Error(existing.error);
      return {
        status: "uncertain",
        commandId: command.commandId,
        message: "Command already accepted; inspect state before an explicit retry",
      };
    }
    try {
      const result = await dispatch({
        ...command,
        requestId: command.requestId ?? command.commandId,
      });
      store.put("tasks", { id, fingerprint, status: "complete", result: result ?? null });
      if (command.commandId.startsWith("telegram:"))
        await ctx.notify({ type: "command-result", commandId: command.commandId, result });
      return result;
    } catch (error) {
      store.put("tasks", { id, fingerprint, status: "failed", error: String(error) });
      throw error;
    }
  }
  return { execute, close: () => store.close() };
}
