import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseSourceSubmission } from "../deployment/contracts.ts";
import { fileIntegrity } from "../domain.ts";
import type { Context } from "../types.ts";
import { production } from "../production.ts";

const contained = (root: string, value: string) => {
  const rel = relative(root, value);
  return !!rel && !rel.startsWith("..") && !rel.includes("../");
};
function hold(ctx: Context, id: string, reason: string) {
  return ctx.store.put("source_submissions", {
    id,
    submissionId: id,
    status: "held",
    reason,
    updatedAt: ctx.now().toISOString(),
  });
}
export async function scanInbox(ctx: Context, requested?: string) {
  const root = ctx.config.deployment?.intake.path;
  if (!root) throw new Error("Pi inbox is not configured");
  const entries = readdirSync(root, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && (!requested || entry.name === requested)
  );
  const results: unknown[] = [];
  for (const entry of entries) {
    const directory = resolve(root, entry.name);
    const id = entry.name;
    try {
      const ready = join(directory, "READY");
      if (!lstatSync(ready).isFile()) {
        results.push(hold(ctx, id, "READY marker missing"));
        continue;
      }
      const manifestPath = join(directory, "permission.json");
      const manifestStat = statSync(manifestPath);
      if (manifestStat.size > 256 * 1024) throw new Error("Manifest exceeds 256 KiB");
      const manifest = parseSourceSubmission(JSON.parse(readFileSync(manifestPath, "utf8")));
      if (manifest.submissionId !== id) throw new Error("Submission ID does not match folder");
      const safe = (name: string) => {
        if (name.includes("..") || name.includes("/")) throw new Error("Escaped submission path");
        const value = resolve(directory, name);
        if (!contained(directory, value) || lstatSync(value).isSymbolicLink())
          throw new Error("Unsafe submission path");
        return value;
      };
      const video = safe(manifest.videoFile),
        evidence = safe(manifest.permission.evidenceFile);
      const videoStat = statSync(video);
      if (videoStat.size > (ctx.config.deployment?.intake.maxVideoBytes ?? 0))
        throw new Error("Video exceeds Pi intake byte cap");
      // Enforce the duration cap if a pre-computed duration sidecar is present.
      // The sidecar (video-filename.duration.json) is written by operators or ffprobe
      // and allows the byte cap and duration cap to both be enforced before copying.
      const maxVideoMinutes = ctx.config.deployment?.intake.maxVideoMinutes ?? 0;
      const durationSidecar = `${video}.duration.json`;
      try {
        const sidecar = JSON.parse(readFileSync(durationSidecar, "utf8")) as {
          durationSeconds?: number;
        };
        if (
          typeof sidecar.durationSeconds === "number" &&
          sidecar.durationSeconds > maxVideoMinutes * 60
        )
          throw new Error(
            `Video duration ${sidecar.durationSeconds}s exceeds intake minute cap (${maxVideoMinutes} min)`
          );
      } catch (err) {
        if (err instanceof SyntaxError)
          throw new Error("Video duration sidecar is not valid JSON", { cause: err });
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        // No sidecar present: duration will be enforced at qualification time.
      }
      if (manifest.permission.restrictions.length)
        throw new Error("Permission restrictions require resolution");
      const before = fileIntegrity(video),
        evidenceIntegrity = fileIntegrity(evidence),
        manifestSha256 = createHash("sha256").update(readFileSync(manifestPath)).digest("hex");
      const fingerprint = `${manifest.submissionId}:${manifestSha256}:${before.sha256}:${evidenceIntegrity.sha256}`;
      const prior = ctx.store.get<{
        fingerprint?: string;
        status?: string;
        [key: string]: unknown;
      }>("source_submissions", id);
      if (prior?.fingerprint === fingerprint && prior.status === "imported") {
        results.push(prior);
        continue;
      }
      if (prior && prior.fingerprint !== fingerprint)
        throw new Error("Submission ID conflicts with different content");
      const source = await production(ctx, {
        type: "register-source",
        sourceId: manifest.sourceId,
        language: manifest.language,
        filePath: video,
        permission: {
          evidencePath: evidence,
          scope: manifest.permission.scope,
          restrictions: manifest.permission.restrictions,
          expiresAt: manifest.permission.expiresAt,
        },
      });
      const after = fileIntegrity(video);
      if (after.sha256 !== before.sha256) throw new Error("Video changed during import");
      const result = ctx.store.put("source_submissions", {
        id,
        submissionId: id,
        sourceId: manifest.sourceId,
        fingerprint,
        manifestSha256,
        videoSha256: before.sha256,
        evidenceSha256: evidenceIntegrity.sha256,
        status: "imported",
        retainedSourcePath: (source as { filePath?: unknown }).filePath,
        updatedAt: ctx.now().toISOString(),
      });
      results.push(result);
    } catch (error) {
      results.push(hold(ctx, id, error instanceof Error ? error.message : "Invalid submission"));
    }
  }
  return results;
}
