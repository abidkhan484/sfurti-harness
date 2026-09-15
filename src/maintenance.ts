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
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import type { Context, Command } from "./types.ts";
import { loadPostingWindows } from "./deployment/posting-windows.ts";
import { doctorReadiness } from "./deployment/readiness.ts";

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
    try {
      loadPostingWindows(
        ctx.config.posting.windowsFile,
        ctx.config.posting.windows,
        ctx.config.posting.minSpacingMinutes
      );
    } catch {
      missing.push("saved posting windows");
    }
    const readiness = doctorReadiness(ctx, missing);
    const coverage = ctx.store
      .all("posts")
      .filter((p) => p.status === "planned" || p.status === "scheduled").length;
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
      coverage: { plannedPosts: coverage, targetDays: ctx.config.reserve.minimumDays },
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
    const files: Array<{ path: string; sha256: string; bytes: number }> = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile())
          files.push({
            path: relative(media, path),
            bytes: statSync(path).size,
            sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
          });
      }
    };
    if (existsSync(media)) walk(media);
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
        "Stop all workers; restore database and media to the recorded original absolute paths; rebuild the CSV before restarting.",
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
    const missing = (manifest.files ?? [])
      .filter(
        (f: { path: string; sha256: string }) =>
          !existsSync(join(destination, "media", f.path)) ||
          createHash("sha256")
            .update(readFileSync(join(destination, "media", f.path)))
            .digest("hex") !== f.sha256
      )
      .map((f: { path: string; sha256: string }) => f.path);
    if (missing.length)
      throw new Error(`Restore verification missing or changed files: ${missing.join(", ")}`);
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
