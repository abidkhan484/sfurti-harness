import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export interface FileIntegrity {
  bytes: number;
  sha256: string;
}

/** Registration may establish integrity; publication must compare against stored integrity. */
export function fileIntegrity(
  path: unknown,
  expected?: unknown,
  requireStoredIntegrity = false
): FileIntegrity {
  if (requireStoredIntegrity && (!record(expected) || !nonempty(expected.sha256)))
    throw new Error("Missing artifact integrity");
  if (typeof path !== "string") throw new Error("A nonempty artifact or evidence file is required");
  const stat = statSync(path);
  if (!stat.isFile() || !stat.size)
    throw new Error("A nonempty artifact or evidence file is required");
  const bytes = readFileSync(path);
  const result = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  if (expected !== undefined && (!record(expected) || expected.sha256 !== result.sha256))
    throw new Error("Registered file integrity changed");
  return result;
}

export function assertSourcePermission(
  source: unknown,
  requiredAt: Date,
  options: { requireStoredIntegrity?: boolean } = {}
): void {
  if (!Number.isFinite(requiredAt.getTime()))
    throw new Error("A valid permission eligibility date is required");
  if (
    !record(source) ||
    !record(source.permission) ||
    !source.permission.evidencePath ||
    !source.filePath
  )
    throw new Error("Source requires registered permission and an authorized file");
  const permission = source.permission;
  if (!nonempty(source.language))
    throw new Error("Registered source language is required to enforce translation permission");
  const scope = permission.scope;
  if (!Array.isArray(scope) || !scope.includes("edit") || !scope.includes("facebook"))
    throw new Error("Permission scope must explicitly include edit and facebook");
  if (source.language !== "bn" && !scope.includes("translate"))
    throw new Error("Foreign-source permission scope must include translate");
  if (
    permission.restrictions !== undefined &&
    (!Array.isArray(permission.restrictions) || permission.restrictions.length)
  )
    throw new Error("Permission restrictions require operator resolution before production");
  if (
    permission.expiresAt !== undefined &&
    (typeof permission.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(permission.expiresAt)) ||
      Date.parse(permission.expiresAt) <= requiredAt.getTime())
  )
    throw new Error("Source permission expired or invalid");
  fileIntegrity(permission.evidencePath, permission.integrity, options.requireStoredIntegrity);
  fileIntegrity(source.filePath, source.integrity, options.requireStoredIntegrity);
}

export const reviewCriteria = [
  "mission",
  "claims",
  "context",
  "age",
  "bangla",
  "usability",
] as const;
export type ReviewCriterion = (typeof reviewCriteria)[number];
const findingFields = [
  "location",
  "criterion",
  "evidence",
  "correction",
  "acceptanceCondition",
] as const;
export interface ReviewFinding {
  version: number;
  location: string;
  criterion: string;
  evidence: string;
  correction: string;
  acceptanceCondition: string;
}
export interface Review {
  passed: boolean;
  criteria: Record<ReviewCriterion, boolean>;
  findings: ReviewFinding[];
}
export function validReview(value: unknown): value is Review {
  if (
    !record(value) ||
    typeof value.passed !== "boolean" ||
    !record(value.criteria) ||
    !reviewCriteria.every(
      (k) => typeof (value.criteria as Record<string, unknown>)[k] === "boolean"
    ) ||
    !Array.isArray(value.findings)
  )
    return false;
  return value.findings.every(
    (f) =>
      record(f) &&
      Number.isSafeInteger(f.version) &&
      Number(f.version) > 0 &&
      findingFields.every((k) => nonempty(f[k]))
  );
}
export const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "criteria", "findings"],
  properties: {
    passed: { type: "boolean" },
    criteria: {
      type: "object",
      additionalProperties: false,
      required: reviewCriteria,
      properties: Object.fromEntries(reviewCriteria.map((k) => [k, { type: "boolean" }])),
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["version", ...findingFields],
        properties: {
          version: { type: "integer" },
          ...Object.fromEntries(findingFields.map((k) => [k, { type: "string" }])),
        },
      },
    },
  },
};
