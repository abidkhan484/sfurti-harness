import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { Context } from "../types.ts";
import type { RecordData } from "../store.ts";
import { parseSetupReceipt, type SetupReceipt } from "./contracts.ts";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function readinessFingerprint(ctx: Context) {
  const facebook = ctx.config.integrations?.facebook as Record<string, unknown> | undefined;
  const telegram = ctx.config.integrations?.telegram as Record<string, unknown> | undefined;
  return fingerprint({
    pageId: facebook?.pageId,
    operatorUserId: telegram?.operatorUserId,
    models: ctx.config.llm.taskModels,
    toolManifest: ctx.config.deployment?.localTools.manifestPath,
    mission: ctx.mission.version,
    profile: ctx.config.deployment?.profile,
  });
}
function realRecent(ctx: Context, target: string, kinds: string[]) {
  const cutoff =
    ctx.now().getTime() -
    (ctx.config.deployment?.setupReceiptPolicy.connectionMaxAgeDays ?? 7) * 86400_000;
  return ctx.store.all<unknown>("setup_receipts").some((raw) => {
    try {
      const receipt = parseSetupReceipt(raw) as SetupReceipt;
      return (
        receipt.target === target &&
        kinds.includes(receipt.kind) &&
        receipt.outcome === "passed" &&
        receipt.configFingerprint === readinessFingerprint(ctx) &&
        Date.parse(receipt.checkedAt) >= cutoff &&
        !receipt.kind.includes("fixture")
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
    artifact.status !== "approved" ||
    !artifact.filePath ||
    !existsSync(artifact.filePath) ||
    !version?.integrity?.sha256
  )
    return { ok: false, reason: "sample must be an approved current file with integrity" };
  const review = ctx.store
    .all("reviews")
    .find((r) => r.artifactId === artifact.id && r.version === version.number && r.passed === true);
  if (!review && !artifact.reviewedAt)
    return { ok: false, reason: "sample lacks approved review lineage" };
  return { ok: true, artifact, version };
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
  const live = ctx.store.all<unknown>("setup_receipts").filter((raw) => {
    try {
      const r = parseSetupReceipt(raw);
      return (
        r.kind === "facebook-publish-readback" &&
        r.outcome === "passed" &&
        r.configFingerprint === readinessFingerprint(ctx)
      );
    } catch {
      return false;
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
  const liveVerified = {
    outcome: live.length ? "passed" : "failed",
    formats: live.length ? { verified: live.length } : {},
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
