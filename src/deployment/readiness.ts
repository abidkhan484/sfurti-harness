import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Context } from "../types.ts";
import type { RecordData } from "../store.ts";
import { parseSetupReceipt, type SetupReceipt } from "./contracts.ts";
import { assertSourcePermission, fileIntegrity } from "../domain.ts";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function readinessFingerprint(ctx: Context) {
  const facebook = ctx.config.integrations?.facebook as Record<string, unknown> | undefined;
  const telegram = ctx.config.integrations?.telegram as Record<string, unknown> | undefined;
  return fingerprint({
    pageId: facebook?.pageId,
    operatorUserId: telegram?.operatorUserId,
    models: ctx.config.llm.taskModels,
    toolManifest: toolManifestHash(ctx),
    mission: ctx.mission.version,
    profile: ctx.config.deployment?.profile,
  });
}
export function toolManifestHash(ctx: Context) {
  const path = ctx.config.deployment?.localTools.manifestPath;
  if (!path || !existsSync(path)) return undefined;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function receiptMatches(ctx: Context, receipt: SetupReceipt, target: string, kinds: string[]) {
  if (
    receipt.target !== target ||
    !kinds.includes(receipt.kind) ||
    receipt.outcome !== "passed" ||
    receipt.configFingerprint !== readinessFingerprint(ctx) ||
    receipt.kind === "local-fixture"
  )
    return false;
  // Native proof is bound to the actual manifest bytes, never merely its path.
  if (
    receipt.kind === "native-tool" &&
    (!toolManifestHash(ctx) || receipt.toolManifestHash !== toolManifestHash(ctx))
  )
    return false;
  return true;
}
function realRecent(ctx: Context, target: string, kinds: string[]) {
  const cutoff =
    ctx.now().getTime() -
    (ctx.config.deployment?.setupReceiptPolicy.connectionMaxAgeDays ?? 7) * 86400_000;
  return ctx.store.all<unknown>("setup_receipts").some((raw) => {
    try {
      const receipt = parseSetupReceipt(raw) as SetupReceipt;
      return (
        receiptMatches(ctx, receipt, target, kinds) &&
        // Native evidence is immutable and invalidated by its manifest/sample
        // inputs; connection evidence additionally expires by policy.
        (receipt.kind === "native-tool" ||
          (Date.parse(receipt.checkedAt) >= cutoff &&
            Date.parse(receipt.checkedAt) <= ctx.now().getTime()))
      );
    } catch {
      return false;
    }
  });
}
export type SampleCurrentResult =
  { ok: false; reason: string } | { ok: true; artifact: RecordData; version: RecordData };

export function sampleIsCurrent(ctx: Context, artifactId: unknown): SampleCurrentResult {
  if (typeof artifactId !== "string")
    return { ok: false, reason: "sample artifact ID is required" };
  const artifact = ctx.store.get("artifacts", artifactId),
    version = artifact?.versions?.at(-1);
  if (
    !artifact ||
    artifact.kind !== "video" ||
    artifact.origin !== "custom" ||
    artifact.status !== "approved" ||
    !artifact.filePath ||
    !Array.isArray(artifact.sourceIds) ||
    artifact.sourceIds.length !== 1 ||
    !version?.integrity?.sha256
  )
    return { ok: false, reason: "sample must be an approved current file with integrity" };
  try {
    fileIntegrity(artifact.filePath, version.integrity, true);
    for (const sourceId of artifact.sourceIds ?? []) {
      const source = ctx.store.get("sources", sourceId);
      assertSourcePermission(source, ctx.now(), { requireStoredIntegrity: true });
    }
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
  const review = ctx.store
    .all("reviews")
    .find((r) => r.artifactId === artifact.id && r.version === version.number && r.passed === true);
  if (!review)
    return { ok: false, reason: "sample lacks approved review lineage" };
  return { ok: true, artifact, version };
}

/**
 * A remote read-back proves one immutable artifact version, not merely an
 * artifact record which may since have been revised or whose retained file
 * may have changed.  Keep this separate from sample attestation: live proof
 * is informative per format and is never a bootstrap prerequisite.
 */
function liveArtifactIsCurrent(ctx: Context, receipt: SetupReceipt) {
  if (
    typeof receipt.artifactId !== "string" ||
    typeof receipt.artifactVersion !== "string" ||
    typeof receipt.artifactSha256 !== "string"
  )
    return false;
  const artifact = ctx.store.get("artifacts", receipt.artifactId);
  const version = artifact?.versions?.at(-1);
  if (
    artifact?.status !== "approved" ||
    typeof artifact.filePath !== "string" ||
    !version?.integrity?.sha256 ||
    receipt.artifactVersion !== String(version.number) ||
    receipt.artifactSha256 !== version.integrity.sha256
  )
    return false;
  try {
    fileIntegrity(artifact.filePath, version.integrity, true);
    return true;
  } catch {
    return false;
  }
}
export function doctorReadiness(ctx: Context, configuredMissing: string[]) {
  const attestation = ctx.store.get("meta", "setup-attestation");
  const sample = sampleIsCurrent(ctx, attestation?.artifactId);
  const sampleBound =
    sample.ok &&
    attestation?.artifactSha256 === sample.version.integrity.sha256 &&
    attestation?.configFingerprint === readinessFingerprint(ctx);
  const native = realRecent(ctx, "local", ["native-tool"]);
  const connections = [
    realRecent(ctx, "codex", ["codex-inference"]),
    realRecent(ctx, "search", ["search"]),
    realRecent(ctx, "facebook", ["page-read"]),
    realRecent(ctx, "telegram", ["telegram-send"]),
  ];
  const live = ctx.store.all<unknown>("setup_receipts").flatMap((raw): SetupReceipt[] => {
    try {
      const r = parseSetupReceipt(raw);
      return (
        receiptMatches(ctx, r, "facebook", ["facebook-publish-readback"]) &&
        typeof r.remoteId === "string" &&
        r.remoteId.length > 0 &&
        liveArtifactIsCurrent(ctx, r)
      )
        ? [r]
        : [];
    } catch {
      return [];
    }
  });
  const configured = {
    outcome: configuredMissing.length ? "failed" : "passed",
    missing: configuredMissing,
  };
  const locallyTested = {
    outcome: native && sampleBound ? "passed" : "failed",
    missing: [
      !native && "current real native-tool receipt",
      !sampleBound && (sample.ok ? "current sample attestation" : sample.reason),
    ].filter(Boolean),
  };
  const connectionsVerified = {
    outcome: connections.every(Boolean) ? "passed" : "failed",
    missing: ["codex", "search", "facebook", "telegram"]
      .filter((_, i) => !connections[i])
      .map((x) => `current real ${x} receipt`),
  };
  const formats = Object.fromEntries(
    live
      .map((receipt) => ctx.store.get("artifacts", receipt.artifactId as string)?.kind)
      .filter((kind): kind is string => typeof kind === "string")
      .map((kind) => [kind, "passed"])
  );
  const liveVerified = {
    outcome: live.length ? "passed" : "failed",
    formats,
    limitations: ["Public-format proof is separate from bootstrap readiness."],
  };
  return {
    ready:
      configured.outcome === "passed" &&
      locallyTested.outcome === "passed" &&
      connectionsVerified.outcome === "passed",
    configured,
    locallyTested,
    connectionsVerified,
    liveVerified,
    sampleBound,
  };
}
