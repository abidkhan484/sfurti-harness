/** Runtime validation for durable Pi records. These parsers intentionally reject unknown enum values. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${field} must be a nonempty string`);
  return value;
};
const iso = (value: unknown, field: string, optional = false): string | undefined => {
  if (value === undefined && optional) return undefined;
  const result = text(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be an ISO datetime`);
  return result;
};
const arrayOfText = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()))
    throw new Error(`${field} must be an array of nonempty strings`);
  return value;
};

export interface SourceSubmission {
  schemaVersion: 1;
  submissionId: string;
  sourceId: string;
  recommendationId?: string;
  originalUrl: string;
  title: string;
  language: string;
  videoFile: string;
  permission: { evidenceFile: string; scope: string[]; restrictions: string[]; expiresAt?: string };
}
export function parseSourceSubmission(value: unknown): SourceSubmission {
  if (!isRecord(value) || value.schemaVersion !== 1)
    throw new Error("submission schemaVersion must be 1");
  const permission = value.permission;
  if (!isRecord(permission)) throw new Error("submission.permission must be an object");
  const submission: SourceSubmission = {
    schemaVersion: 1,
    submissionId: text(value.submissionId, "submissionId"),
    sourceId: text(value.sourceId, "sourceId"),
    ...(value.recommendationId === undefined
      ? {}
      : { recommendationId: text(value.recommendationId, "recommendationId") }),
    originalUrl: text(value.originalUrl, "originalUrl"),
    title: text(value.title, "title"),
    language: text(value.language, "language"),
    videoFile: text(value.videoFile, "videoFile"),
    permission: {
      evidenceFile: text(permission.evidenceFile, "permission.evidenceFile"),
      scope: arrayOfText(permission.scope, "permission.scope"),
      restrictions: arrayOfText(permission.restrictions, "permission.restrictions"),
      ...(permission.expiresAt === undefined
        ? {}
        : { expiresAt: iso(permission.expiresAt, "permission.expiresAt")! }),
    },
  };
  if (!/^https?:\/\//.test(submission.originalUrl)) throw new Error("originalUrl must be HTTP(S)");
  if (
    !submission.permission.scope.includes("edit") ||
    !submission.permission.scope.includes("facebook")
  )
    throw new Error("permission requires edit and facebook scope");
  if (submission.language !== "bn" && !submission.permission.scope.includes("translate"))
    throw new Error("foreign submissions require translate scope");
  return submission;
}

export interface Recommendation {
  id: string;
  sourceId: string;
  canonicalUrl: string;
  title: string;
  language: string | null;
  topic: string;
  rationaleBn: string;
  observedEvidence: unknown[];
  tentativeSegments: unknown[];
  limitations: string[];
  discoveredAt: string;
  batchId: string;
}
export function parseRecommendation(value: unknown): Recommendation {
  if (!isRecord(value)) throw new Error("recommendation must be an object");
  const language = value.language;
  if (language !== null && typeof language !== "string")
    throw new Error("recommendation.language must be string or null");
  if (!Array.isArray(value.observedEvidence) || !Array.isArray(value.tentativeSegments))
    throw new Error("recommendation evidence and segments must be arrays");
  return {
    id: text(value.id, "recommendation.id"),
    sourceId: text(value.sourceId, "recommendation.sourceId"),
    canonicalUrl: text(value.canonicalUrl, "recommendation.canonicalUrl"),
    title: text(value.title, "recommendation.title"),
    language,
    topic: text(value.topic, "recommendation.topic"),
    rationaleBn: text(value.rationaleBn, "recommendation.rationaleBn"),
    observedEvidence: value.observedEvidence,
    tentativeSegments: value.tentativeSegments,
    limitations: arrayOfText(value.limitations, "recommendation.limitations"),
    discoveredAt: iso(value.discoveredAt, "recommendation.discoveredAt")!,
    batchId: text(value.batchId, "recommendation.batchId"),
  };
}

export interface Qualification {
  sourceId: string;
  sourceSha256: string;
  missionVersion: string;
  topic: string;
  topics: string[];
  segments: { startMs: number; endMs: number }[];
  evidencePath: string;
  evidenceSha256: string;
  reviewerIdentity: string;
  qualifiedAt: string;
  relevant: boolean;
  credible: boolean;
  actualContentReviewed: boolean;
  locallyRelevant: boolean;
  limitations: string[];
}
export function parseQualification(value: unknown): Qualification {
  if (!isRecord(value) || !Array.isArray(value.segments))
    throw new Error("qualification.segments must be an array");
  const segments = value.segments.map((segment) => {
    if (
      !isRecord(segment) ||
      !Number.isSafeInteger(segment.startMs) ||
      !Number.isSafeInteger(segment.endMs) ||
      Number(segment.startMs) < 0 ||
      Number(segment.endMs) <= Number(segment.startMs)
    )
      throw new Error("qualification interval is invalid");
    return { startMs: Number(segment.startMs), endMs: Number(segment.endMs) };
  });
  for (let i = 1; i < segments.length; i++)
    if (segments[i - 1].endMs > segments[i].startMs)
      throw new Error("qualification intervals overlap");
  for (const key of ["relevant", "credible", "actualContentReviewed", "locallyRelevant"] as const)
    if (typeof value[key] !== "boolean") throw new Error(`qualification.${key} must be boolean`);
  return {
    sourceId: text(value.sourceId, "qualification.sourceId"),
    sourceSha256: text(value.sourceSha256, "qualification.sourceSha256"),
    missionVersion: text(value.missionVersion, "qualification.missionVersion"),
    topic: text(value.topic, "qualification.topic"),
    topics: arrayOfText(value.topics, "qualification.topics"),
    segments,
    evidencePath: text(value.evidencePath, "qualification.evidencePath"),
    evidenceSha256: text(value.evidenceSha256, "qualification.evidenceSha256"),
    reviewerIdentity: text(value.reviewerIdentity, "qualification.reviewerIdentity"),
    qualifiedAt: iso(value.qualifiedAt, "qualification.qualifiedAt")!,
    relevant: value.relevant as boolean,
    credible: value.credible as boolean,
    actualContentReviewed: value.actualContentReviewed as boolean,
    locallyRelevant: value.locallyRelevant as boolean,
    limitations: arrayOfText(value.limitations, "qualification.limitations"),
  };
}

const receiptOutcomes = ["passed", "failed", "partial", "unknown"] as const;
const receiptKinds = [
  "local-fixture",
  "native-tool",
  "codex-inference",
  "search",
  "page-read",
  "telegram-send",
  "facebook-publish-readback",
] as const;
export interface SetupReceipt {
  id: string;
  schemaVersion: 1;
  target: string;
  kind: string;
  checkedAt: string;
  outcome: (typeof receiptOutcomes)[number];
  configFingerprint: string;
  identityFingerprint: string;
  toolManifestHash?: string;
  artifactId?: string;
  artifactVersion?: string;
  artifactSha256?: string;
  remoteId?: string;
  evidencePaths: string[];
  limitations: string[];
}
export function parseSetupReceipt(value: unknown): SetupReceipt {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !receiptOutcomes.includes(value.outcome as never) ||
    !receiptKinds.includes(value.kind as never)
  )
    throw new Error("setup receipt is invalid");
  return {
    id: text(value.id, "receipt.id"),
    schemaVersion: 1,
    target: text(value.target, "receipt.target"),
    kind: text(value.kind, "receipt.kind"),
    checkedAt: iso(value.checkedAt, "receipt.checkedAt")!,
    outcome: value.outcome as SetupReceipt["outcome"],
    configFingerprint: text(value.configFingerprint, "receipt.configFingerprint"),
    identityFingerprint: text(value.identityFingerprint, "receipt.identityFingerprint"),
    ...(value.toolManifestHash === undefined
      ? {}
      : { toolManifestHash: text(value.toolManifestHash, "receipt.toolManifestHash") }),
    ...(value.artifactId === undefined
      ? {}
      : { artifactId: text(value.artifactId, "receipt.artifactId") }),
    ...(value.artifactVersion === undefined
      ? {}
      : { artifactVersion: text(value.artifactVersion, "receipt.artifactVersion") }),
    ...(value.artifactSha256 === undefined
      ? {}
      : { artifactSha256: text(value.artifactSha256, "receipt.artifactSha256") }),
    ...(value.remoteId === undefined ? {} : { remoteId: text(value.remoteId, "receipt.remoteId") }),
    evidencePaths: arrayOfText(value.evidencePaths, "receipt.evidencePaths"),
    limitations: arrayOfText(value.limitations, "receipt.limitations"),
  };
}

const taskStatuses = [
  "queued",
  "running",
  "deferred",
  "completed",
  "failed",
  "needs-attention",
] as const;
export function parseDurableTask(value: unknown) {
  if (
    !isRecord(value) ||
    !taskStatuses.includes(value.status as never) ||
    !Number.isSafeInteger(value.attempt) ||
    Number(value.attempt) < 0
  )
    throw new Error("durable task is invalid");
  return {
    taskId: text(value.taskId, "taskId"),
    stage: text(value.stage, "stage"),
    status: value.status,
    attempt: Number(value.attempt),
    inputHash: text(value.inputHash, "inputHash"),
    outputManifest: value.outputManifest,
    provider: text(value.provider, "provider"),
    model: text(value.model, "model"),
    role: text(value.role, "role"),
    sessionRef: text(value.sessionRef, "sessionRef"),
    nextRunAt: iso(value.nextRunAt, "nextRunAt")!,
    quotaScope: text(value.quotaScope, "quotaScope"),
    leaseOwner: text(value.leaseOwner, "leaseOwner"),
    leaseUntil: iso(value.leaseUntil, "leaseUntil")!,
  };
}

export function parseOperationJournal(value: unknown) {
  if (!isRecord(value) || !Number.isSafeInteger(value.attempt) || Number(value.attempt) < 0)
    throw new Error("operation journal is invalid");
  return {
    operationId: text(value.operationId, "operationId"),
    destinationIdentity: text(value.destinationIdentity, "destinationIdentity"),
    selectedArtifactHash: text(value.selectedArtifactHash, "selectedArtifactHash"),
    phase: text(value.phase, "phase"),
    requestFingerprint: text(value.requestFingerprint, "requestFingerprint"),
    attempt: Number(value.attempt),
    remoteIds: arrayOfText(value.remoteIds, "remoteIds"),
    lastConfirmedState: text(value.lastConfirmedState, "lastConfirmedState"),
    uncertainty:
      typeof value.uncertainty === "boolean"
        ? value.uncertainty
        : (() => {
            throw new Error("operation uncertainty must be boolean");
          })(),
  };
}
