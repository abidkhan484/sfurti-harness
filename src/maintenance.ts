import {
  existsSync,
  mkdirSync,
  statSync,
  statfsSync,
  cpSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { resolve, join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { today, type Context, type Command } from "./types.ts";
import { Store, type RecordData } from "./store.ts";
import { availablePostingCapacity, loadPostingWindows } from "./deployment/posting-windows.ts";
import { doctorReadiness } from "./deployment/readiness.ts";
import { fileIntegrity } from "./domain.ts";

export async function maintenance(ctx: Context, command: Command) {
  if (command.type === "doctor") {
    if (ctx.config.deployment?.profile !== "pi-free") {
      const missing: string[] = [];
      for (const name of ["editor", "media", "reviewer", "discovery", "facebook", "delivery"])
        if (!ctx.adapters[name]) missing.push(`${name} adapter`);
      return {
        ready: missing.length === 0,
        missing,
        liveChecksPerformed: false,
        node: process.version,
        database: ctx.config.storage.databasePath,
      };
    }
    const missing: string[] = [];
    for (const name of ["editor", "media", "reviewer", "discovery", "facebook"])
      if (!ctx.adapters[name]) missing.push(`${name} adapter`);
    if (ctx.config.deployment.delivery.enabled && !ctx.adapters.delivery)
      missing.push("delivery adapter");
    if (!ctx.config.posting.minSpacingMinutes) missing.push("posting.minSpacingMinutes");
    if (!existsSync(ctx.config.deployment.localTools.manifestPath))
      missing.push("local tool manifest");
    let postingCapacity: { available: number; required: number } | undefined;
    try {
      const savedWindows = loadPostingWindows(
        ctx.config.posting.windowsFile,
        ctx.config.posting.windows,
        ctx.config.posting.minSpacingMinutes
      );
      const date = today(ctx);
      const existing = ctx.store
        .all("posts")
        .filter(
          (post) =>
            post.date === date &&
            ["planned", "submitting", "uncertain", "scheduled", "published"].includes(post.status) &&
            typeof post.scheduledAt === "string"
        )
        .map((post) => post.scheduledAt as string);
      const required = Math.max(
        0,
        ctx.config.daily.videos + ctx.config.daily.images + ctx.config.daily.texts - existing.length
      );
      const available = availablePostingCapacity(savedWindows, {
        date,
        spacingMinutes: ctx.config.posting.minSpacingMinutes ?? 0,
        now: ctx.now(),
        occupiedAt: existing,
      });
      postingCapacity = { available, required };
      if (available < required) missing.push("five-slot posting capacity");
    } catch {
      missing.push("saved posting windows");
    }
    const readiness = doctorReadiness(ctx, missing);
    const coveredPosts = ctx.store.all("posts").filter((post) => {
      if (
        !["planned", "scheduled"].includes(post.status) ||
        post.origin === "custom" ||
        typeof post.artifactId !== "string"
      )
        return false;
      const artifact = ctx.store.get("artifacts", post.artifactId);
      const version = artifact?.versions?.at(-1);
      if (artifact?.status !== "approved" || !artifact.filePath || !version?.integrity) return false;
      try {
        fileIntegrity(artifact.filePath, version.integrity, true);
        return true;
      } catch {
        return false;
      }
    });
    const byDate = new Map<string, typeof coveredPosts>();
    for (const post of coveredPosts) {
      if (!post.date) continue;
      byDate.set(post.date, [...(byDate.get(post.date) ?? []), post]);
    }
    const backedDays = [...byDate.values()].filter((posts) => {
      const artifacts = posts
        .map((post) => ctx.store.get("artifacts", post.artifactId))
        .filter((artifact): artifact is RecordData => artifact !== undefined);
      const count = (kind: string) => artifacts.filter((artifact) => artifact.kind === kind).length;
      const videoSources = new Set(
        artifacts.filter((artifact) => artifact.kind === "video").flatMap((artifact) => artifact.sourceIds ?? [])
      );
      return count("video") >= 3 && count("image") >= 1 && count("text") >= 1 && videoSources.size >= 3;
    }).length;
    const coverageBytes = coveredPosts.reduce((total, post) => {
      const artifact = ctx.store.get("artifacts", post.artifactId);
      return total + Number(artifact?.versions?.at(-1)?.integrity?.bytes ?? 0);
    }, 0);
    return {
      ready: readiness.ready,
      missing: [
        ...missing,
        ...readiness.locallyTested.missing,
        ...readiness.connectionsVerified.missing,
      ],
      liveChecksPerformed: false,
      configured: readiness.configured,
      locallyTested: readiness.locallyTested,
      connectionsVerified: readiness.connectionsVerified,
      liveVerified: readiness.liveVerified,
      postingCapacity,
      coverage: {
        plannedPosts: coveredPosts.length,
        backedDays,
        targetDays: ctx.config.reserve.minimumDays,
        estimatedBytes: coverageBytes,
      },
      throughput: {
        maxTasksPerTick: ctx.config.limits.maxTasksPerTick,
        heavyTaskConcurrency: ctx.config.deployment.localTools.heavyTaskConcurrency,
      },
      dubbing: {
        configured: Boolean(ctx.config.tts.executable && ctx.config.tts.voiceId),
        enabled: ctx.config.video.allowBanglaDubbing,
      },
      node: process.version,
      database: ctx.config.storage.databasePath,
    };
  }
  if (command.type === "backup") {
    if (typeof command.destination !== "string" || !command.destination)
      throw new Error("Backup destination required");
    if (
      ctx.store.all("jobs").some((j) => j.status === "running") ||
      ctx.store
        .all("artifacts")
        .some((a) => a.leaseOwner && Date.parse(a.leaseUntil) > ctx.now().getTime())
    )
      throw new Error("Stop active work before creating a backup");
    const destination = resolve(command.destination);
    if (existsSync(destination)) throw new Error("Backup destination must be a new directory");
    const media = resolve(ctx.config.storage.mediaDirectory),
      inbox = ctx.config.deployment?.intake.path
        ? resolve(ctx.config.deployment.intake.path)
        : undefined;
    const inside = (base: string) => {
      const r = relative(base, destination);
      return r === "" || (!r.startsWith("..") && !r.startsWith("/"));
    };
    if (
      inside(media) ||
      (inbox && inside(inbox)) ||
      destination === resolve(ctx.config.storage.databasePath)
    )
      throw new Error(
        "Backup destination must be outside managed media, inbox, and database paths"
      );
    const mediaBytes = existsSync(media)
      ? (() => {
          let total = 0;
          const walk = (dir: string) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
              const path = join(dir, entry.name);
              if (entry.isDirectory()) walk(path);
              else if (entry.isFile()) total += statSync(path).size;
            }
          };
          walk(media);
          return total;
        })()
      : 0;
    const requiredBytes = statSync(ctx.config.storage.databasePath).size + mediaBytes;
    const fs = statfsSync(resolve(destination, ".."));
    if (
      fs.bavail * fs.bsize <
      requiredBytes + (ctx.config.deployment?.storageBudget.minFreeBytes ?? 0)
    )
      throw new Error(
        `Backup storage admission rejected; needs ${requiredBytes} bytes plus free-space reserve`
      );
    mkdirSync(destination, { recursive: true });
    await ctx.store.backup(join(destination, "sfurti.sqlite"));
    cpSync(media, join(destination, "media"), { recursive: true, dereference: false });
    const databaseHash = createHash("sha256")
      .update(readFileSync(join(destination, "sfurti.sqlite")))
      .digest("hex");
    const files: Array<{ path: string; backupPath: string; sha256: string; bytes: number }> = [];
    const retained = new Set<string>();
    const addFile = (path: string, backupPath: string) => {
      const absolute = resolve(path);
      if (retained.has(absolute) || !existsSync(absolute) || !statSync(absolute).isFile()) return;
      retained.add(absolute);
      const bytes = statSync(absolute).size;
      const sha256 = createHash("sha256").update(readFileSync(absolute)).digest("hex");
      files.push({ path: absolute, backupPath, bytes, sha256 });
    };
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile()) addFile(path, join("media", relative(media, path)));
      }
    };
    if (existsSync(media)) walk(media);
    // The durable DB is the authoritative lineage ledger.  Preserve every
    // retained source/artifact/evidence path it references, including legacy
    // files outside the managed media directory, but never configuration,
    // auth, or secret-file references.
    const lineageRecords = [
      ...ctx.store.all("sources"),
      ...ctx.store.all("artifacts"),
      ...ctx.store.all("qualifications"),
      ...ctx.store.all("reviews"),
      ...ctx.store.all("setup_receipts"),
    ];
    const collectPaths = (value: unknown, key = ""): string[] => {
      if (typeof value === "string") return ["filePath", "evidencePath"].includes(key) ? [value] : [];
      if (Array.isArray(value))
        return key === "evidencePaths"
          ? value.filter((item): item is string => typeof item === "string")
          : value.flatMap((item) => collectPaths(item));
      if (!value || typeof value !== "object") return [];
      return Object.entries(value).flatMap(([childKey, child]) => collectPaths(child, childKey));
    };
    for (const path of lineageRecords.flatMap((record) => collectPaths(record))) {
      const absolute = resolve(path);
      if (retained.has(absolute) || !existsSync(absolute) || !statSync(absolute).isFile()) continue;
      const sha256 = createHash("sha256").update(readFileSync(absolute)).digest("hex");
      const backupPath = join("lineage", `${sha256}${extname(absolute) || ".bin"}`);
      const target = join(destination, backupPath);
      mkdirSync(resolve(target, ".."), { recursive: true });
      cpSync(absolute, target, { dereference: false });
      addFile(absolute, backupPath);
    }
    const manifest = {
      schemaVersion: 1,
      createdAt: ctx.now().toISOString(),
      databasePath: ctx.config.storage.databasePath,
      mediaDirectory: media,
      databaseSha256: databaseHash,
      files,
      rowCounts: Object.fromEntries(
        [
          "sources",
          "permissions",
          "qualifications",
          "artifacts",
          "reviews",
          "posts",
          "operation_journals",
          "setup_receipts",
        ].map((n) => [n, ctx.store.all(n).length])
      ),
      config: {
        profile: ctx.config.deployment?.profile,
        productionMode: ctx.config.productionMode,
        researchEnabled: ctx.config.research.enabled,
        toolManifestPath: ctx.config.deployment?.localTools.manifestPath,
      },
      restore:
        "Stop all workers; restore database and media/lineage only into a new isolated path, verify all checksums and references, reconcile remote state, then reauthenticate before any submission.",
    };
    writeFileSync(join(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", {
      mode: 0o600,
    });
    return {
      destination,
      databaseBytes: statSync(join(destination, "sfurti.sqlite")).size,
      ...manifest,
    };
  }
  if (command.type === "restore-verify") {
    if (typeof command.source !== "string" || typeof command.destination !== "string")
      throw new Error("Restore source and isolated destination are required");
    const source = resolve(command.source),
      destination = resolve(command.destination);
    if (!existsSync(join(source, "manifest.json")) || existsSync(destination))
      throw new Error("Restore requires an existing backup and a new isolated destination");
    const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
    if (
      createHash("sha256")
        .update(readFileSync(join(source, "sfurti.sqlite")))
        .digest("hex") !== manifest.databaseSha256
    )
      throw new Error("Backup database checksum failed");
    mkdirSync(destination, { recursive: true });
    cpSync(join(source, "sfurti.sqlite"), join(destination, "sfurti.sqlite"));
    cpSync(join(source, "media"), join(destination, "media"), { recursive: true });
    if (existsSync(join(source, "lineage")))
      cpSync(join(source, "lineage"), join(destination, "lineage"), { recursive: true });
    const missing = (manifest.files ?? [])
      .filter(
        (f: { path: string; backupPath?: string; sha256: string }) =>
          !existsSync(join(destination, f.backupPath ?? join("media", f.path))) ||
          createHash("sha256")
            .update(readFileSync(join(destination, f.backupPath ?? join("media", f.path))))
            .digest("hex") !== f.sha256
      )
      .map((f: { path: string; backupPath?: string; sha256: string }) => f.path);
    if (missing.length)
      throw new Error(`Restore verification missing or changed files: ${missing.join(", ")}`);
    // Opening a separate Store checks that migrations/schema are readable; the
    // manifest counts catch a truncated but checksum-valid wrong database.
    const restoredStore = new Store(join(destination, "sfurti.sqlite"));
    try {
      const rowCountMismatches = Object.entries(manifest.rowCounts ?? {}).filter(
        ([collection, expected]) =>
          restoredStore.all(collection).length !== expected
      );
      if (rowCountMismatches.length)
        throw new Error(
          `Restore verification row-count mismatch: ${rowCountMismatches
            .map(([collection]) => collection)
            .join(", ")}`
        );
    } finally {
      restoredStore.close();
    }
    return {
      destination,
      verified: true,
      reconciliationRequired: true,
      limitations: [
        "Restored remote state must reconcile before a new submission; reauthenticate private operator credentials separately.",
      ],
    };
  }
  throw new Error("Unknown maintenance command");
}
