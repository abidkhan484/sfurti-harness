import { existsSync, mkdirSync, statSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import type { Context, Command } from "./types.ts";

export async function maintenance(ctx: Context, command: Command) {
  if (command.type === "doctor") {
    const missing: string[] = [];
    for (const name of ["editor", "media", "reviewer", "discovery", "facebook", "delivery"])
      if (!ctx.adapters[name]) missing.push(`${name} adapter`);
    if (!ctx.config.posting.minSpacingMinutes) missing.push("posting.minSpacingMinutes");
    try {
      const saved = JSON.parse(readFileSync(ctx.config.posting.windowsFile, "utf8"));
      if (
        saved.timezone !== "Asia/Dhaka" ||
        !Array.isArray(saved.windows) ||
        !saved.windows.length ||
        !Array.isArray(saved.evidence) ||
        !saved.evidence.length ||
        !saved.researchedAt ||
        !saved.limitations
      )
        missing.push("researched posting windows with evidence, date and limitations");
    } catch {
      missing.push("saved posting windows");
    }
    if (!ctx.config.setup?.verifiedSample || !ctx.config.setup.verifiedAt)
      missing.push("verified end-to-end sample attestation");
    else {
      const artifact = ctx.store.get("artifacts", ctx.config.setup.verifiedSample);
      if (
        !artifact ||
        artifact.status !== "approved" ||
        !artifact.filePath ||
        !existsSync(artifact.filePath)
      )
        missing.push("approved setup sample artifact");
    }
    return {
      ready: missing.length === 0,
      missing,
      liveChecksPerformed: false,
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
    const media = resolve(ctx.config.storage.mediaDirectory);
    if (!relative(media, destination).startsWith(".."))
      throw new Error("Backup destination must be outside the media library");
    mkdirSync(destination, { recursive: true });
    await ctx.store.backup(join(destination, "sfurti.sqlite"));
    cpSync(media, join(destination, "media"), { recursive: true, dereference: false });
    const databaseHash = createHash("sha256")
      .update(readFileSync(join(destination, "sfurti.sqlite")))
      .digest("hex");
    const manifest = {
      createdAt: ctx.now().toISOString(),
      databasePath: ctx.config.storage.databasePath,
      mediaDirectory: media,
      databaseSha256: databaseHash,
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
  throw new Error("Unknown maintenance command");
}
