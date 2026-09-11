import type * as C from "./contracts.ts";

type ObjectValue = Record<string, unknown>;
const MAX_ARRAY = 100;
const enums = {
  certainty: ["high", "moderate", "low", "very_low", "not_assessed"],
  claimStatus: [
    "draft",
    "approved",
    "qualified",
    "deferred",
    "rejected",
    "expired",
    "withdrawn",
    "superseded",
  ],
} as const;
function object(value: unknown, name = "value"): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  return value as ObjectValue;
}
function string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${name} must be a nonempty string`);
  return value;
}
function nullableString(value: unknown, name: string): string | null {
  return value === null ? null : string(value, name);
}
function iso(value: unknown, name: string): string {
  const result = string(value, name);
  if (!Number.isFinite(Date.parse(result)) || !result.endsWith("Z"))
    throw new Error(`${name} must be a UTC ISO date`);
  return result;
}
function nullableIso(value: unknown, name: string): string | null {
  return value === null ? null : iso(value, name);
}
function enumValue<T extends readonly string[]>(
  value: unknown,
  values: T,
  name: string
): T[number] {
  if (typeof value !== "string" || !values.includes(value))
    throw new Error(`${name} has an unknown value`);
  return value as T[number];
}
function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ARRAY)
    throw new Error(`${name} must be an array of at most ${MAX_ARRAY}`);
  return value;
}
function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be boolean`);
  return value;
}
function integer(value: unknown, name: string, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min)
    throw new Error(`${name} must be an integer >= ${min}`);
  return value as number;
}
function ids(value: unknown, name: string): string[] {
  return array(value, name).map((item, index) => string(item, `${name}[${index}]`));
}
function noOwnedFields(value: ObjectValue, name: string, fields: string[]): void {
  for (const field of fields)
    if (field in value) throw new Error(`${name}.${field} is application-owned`);
}
function envelope(value: ObjectValue): C.ResearchEnvelope {
  if (value.schemaVersion !== 1) throw new Error("schemaVersion has an unknown value");
  return {
    id: string(value.id, "id"),
    schemaVersion: 1,
    createdAt: iso(value.createdAt, "createdAt"),
    updatedAt: iso(value.updatedAt, "updatedAt"),
  };
}
export function parseAgeRange(value: unknown, name = "ageRange"): C.AgeRange {
  const o = object(value, name);
  const min = integer(o.min, `${name}.min`);
  const max = integer(o.max, `${name}.max`);
  if (max < min) throw new Error(`${name}.max must be >= min`);
  return { min, max };
}
export function parseLocator(value: unknown, name = "locator"): C.TextLocator {
  const o = object(value, name);
  const start = integer(o.start, `${name}.start`);
  const end = integer(o.end, `${name}.end`);
  if (end <= start) throw new Error(`${name}.end must be greater than start`);
  const locator: C.TextLocator = { start, end };
  if (o.page !== undefined) locator.page = integer(o.page, `${name}.page`, 1);
  if (o.section !== undefined) locator.section = string(o.section, `${name}.section`);
  return locator;
}
export function parseTriageSource(value: unknown): C.TriageSource {
  const o = object(value);
  return {
    ...envelope(o),
    canonicalOrigin: string(o.canonicalOrigin, "canonicalOrigin"),
    kind: enumValue(o.kind, ["web", "scholarly", "feed", "discussion", "expert"] as const, "kind"),
    access: enumValue(o.access, ["public", "authenticated"] as const, "access"),
    collectionState: enumValue(
      o.collectionState,
      ["candidate", "enabled", "blocked", "authentication_required"] as const,
      "collectionState"
    ),
    quality: enumValue(
      o.quality,
      [
        "unassessed",
        "institutional_guidance",
        "evidence_publication",
        "expert_commentary",
        "audience_discussion",
        "other",
      ] as const,
      "quality"
    ),
    rationale: string(o.rationale, "rationale"),
    firstDiscoveredQueryId: string(o.firstDiscoveredQueryId, "firstDiscoveredQueryId"),
    lastCheckedAt: nullableIso(o.lastCheckedAt, "lastCheckedAt"),
    policyVersion: string(o.policyVersion, "policyVersion"),
    profileRef: o.profileRef === undefined ? null : nullableString(o.profileRef, "profileRef"),
  };
}
export function parseFinding(value: unknown): C.Finding {
  const o = object(value);
  return {
    ...envelope(o),
    documentVersionId: string(o.documentVersionId, "documentVersionId"),
    locator: parseLocator(o.locator),
    originalExcerpt: string(o.originalExcerpt, "originalExcerpt"),
    workingTranslation: nullableString(o.workingTranslation, "workingTranslation"),
    language: string(o.language, "language"),
    studyDesign: string(o.studyDesign, "studyDesign"),
    population: string(o.population, "population"),
    exposure: string(o.exposure, "exposure"),
    comparison: string(o.comparison, "comparison"),
    outcome: string(o.outcome, "outcome"),
    result: string(o.result, "result"),
    effectSize: nullableString(o.effectSize, "effectSize"),
    uncertainty: nullableString(o.uncertainty, "uncertainty"),
    limitations: string(o.limitations, "limitations"),
    funding: nullableString(o.funding, "funding"),
    causalSupport: bool(o.causalSupport, "causalSupport"),
    overlapGroup: nullableString(o.overlapGroup, "overlapGroup"),
  };
}
export function parseClaimVersion(value: unknown): C.ClaimVersion {
  const o = object(value);
  const scope = object(o.scope, "scope");
  const revision = integer(o.revision, "revision", 1);
  const claim = {
    ...envelope(o),
    revision,
    previousVersionId:
      o.previousVersionId === undefined
        ? null
        : nullableString(o.previousVersionId, "previousVersionId"),
    topicId: string(o.topicId, "topicId"),
    synthesisVersionId: string(o.synthesisVersionId, "synthesisVersionId"),
    kind: enumValue(
      o.kind,
      ["evidence", "interpretation", "hypothesis", "business_opinion"] as const,
      "kind"
    ),
    wordingBn: string(o.wordingBn, "wordingBn"),
    allowedParaphraseRules: ids(o.allowedParaphraseRules, "allowedParaphraseRules"),
    forbiddenOverstatements: ids(o.forbiddenOverstatements, "forbiddenOverstatements"),
    findingIds: ids(o.findingIds, "findingIds"),
    parentClaimIds: ids(o.parentClaimIds, "parentClaimIds"),
    scope: {
      ages: o.scope && scope.ages === null ? null : parseAgeRange(scope.ages, "scope.ages"),
      region: nullableString(scope.region, "scope.region"),
      context: string(scope.context, "scope.context"),
    },
    certainty: enumValue(o.certainty, enums.certainty, "certainty"),
    certaintyReasons: ids(o.certaintyReasons, "certaintyReasons"),
    status: enumValue(o.status, enums.claimStatus, "status"),
    reviewId: nullableString(o.reviewId, "reviewId"),
    validUntil: nullableIso(o.validUntil, "validUntil"),
    lastCheckedAt: nullableIso(o.lastCheckedAt, "lastCheckedAt"),
    missionRelevance: string(o.missionRelevance, "missionRelevance"),
    attribution: nullableString(o.attribution, "attribution"),
  };
  return claim;
}
export function parseSearchPlanDraft(value: unknown): C.SearchPlanDraft {
  const o = object(value);
  return {
    queries: array(o.queries, "queries").map((value, index) => {
      const q = object(value, `queries[${index}]`);
      return {
        text: string(q.text, `queries[${index}].text`),
        language: string(q.language, `queries[${index}].language`),
        intent: enumValue(
          q.intent,
          ["neutral", "counter_evidence", "practical"] as const,
          `queries[${index}].intent`
        ),
        reason: string(q.reason, `queries[${index}].reason`),
      };
    }),
    nextQuestions: ids(o.nextQuestions, "nextQuestions"),
  };
}
export function parseExtractionDraft(value: unknown): C.ExtractionDraft {
  const o = object(value);
  return {
    items: array(o.items, "items").map((value, index) => {
      const i = object(value, `items[${index}]`);
      return {
        kind: enumValue(
          i.kind,
          ["audience_signal", "expert_opinion", "evidence_candidate", "irrelevant"] as const,
          `items[${index}].kind`
        ),
        excerptLocator: parseLocator(i.excerptLocator, `items[${index}].excerptLocator`),
        redactedText: string(i.redactedText, `items[${index}].redactedText`),
        language: string(i.language, `items[${index}].language`),
        region: nullableString(i.region, `items[${index}].region`),
        ageRange:
          i.ageRange === null ? null : parseAgeRange(i.ageRange, `items[${index}].ageRange`),
        question: nullableString(i.question, `items[${index}].question`),
        classificationReason: string(
          i.classificationReason,
          `items[${index}].classificationReason`
        ),
      };
    }),
    findings: array(o.findings, "findings").map((value, index) => {
      const f = object(value, `findings[${index}]`);
      return parseFinding({
        ...f,
        id: "draft",
        schemaVersion: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        documentVersionId: "draft",
      });
    }),
  };
}
export function parseSynthesisDraft(value: unknown): C.SynthesisDraft {
  const o = object(value);
  return {
    claims: array(o.claims, "claims").map((value, index) => {
      const c = object(value, `claims[${index}]`);
      noOwnedFields(c, `claims[${index}]`, [
        "id",
        "schemaVersion",
        "createdAt",
        "updatedAt",
        "revision",
        "status",
        "reviewId",
        "validUntil",
        "lastCheckedAt",
        "approved",
      ]);
      const scope = object(c.scope, `claims[${index}].scope`);
      return {
        previousVersionId:
          c.previousVersionId === undefined
            ? null
            : nullableString(c.previousVersionId, `claims[${index}].previousVersionId`),
        kind: enumValue(
          c.kind,
          ["evidence", "interpretation", "hypothesis", "business_opinion"] as const,
          `claims[${index}].kind`
        ),
        wordingBn: string(c.wordingBn, `claims[${index}].wordingBn`),
        allowedParaphraseRules: ids(
          c.allowedParaphraseRules,
          `claims[${index}].allowedParaphraseRules`
        ),
        forbiddenOverstatements: ids(
          c.forbiddenOverstatements,
          `claims[${index}].forbiddenOverstatements`
        ),
        findingIds: ids(c.findingIds, `claims[${index}].findingIds`),
        parentClaimIds: ids(c.parentClaimIds, `claims[${index}].parentClaimIds`),
        scope: {
          ages:
            scope.ages === null ? null : parseAgeRange(scope.ages, `claims[${index}].scope.ages`),
          region: nullableString(scope.region, `claims[${index}].scope.region`),
          context: string(scope.context, `claims[${index}].scope.context`),
        },
        certainty: enumValue(c.certainty, enums.certainty, `claims[${index}].certainty`),
        certaintyReasons: ids(c.certaintyReasons, `claims[${index}].certaintyReasons`),
        missionRelevance: string(c.missionRelevance, `claims[${index}].missionRelevance`),
        attribution: nullableString(c.attribution, `claims[${index}].attribution`),
      };
    }),
    conflicts: array(o.conflicts, "conflicts").map((value, index) => {
      const c = object(value, `conflicts[${index}]`);
      return {
        findingIds: ids(c.findingIds, `conflicts[${index}].findingIds`),
        reason: string(c.reason, `conflicts[${index}].reason`),
        resolution: enumValue(
          c.resolution,
          ["unresolved", "wording_corrected", "context_difference", "qualified"] as const,
          `conflicts[${index}].resolution`
        ),
      };
    }),
    limitations: string(o.limitations, "limitations"),
    decision: enumValue(o.decision, ["ready", "defer", "reject"] as const, "decision"),
  };
}
export function parseEvidenceReviewDraft(value: unknown): C.EvidenceReviewDraft {
  const o = object(value);
  noOwnedFields(o, "review", [
    "id",
    "schemaVersion",
    "createdAt",
    "updatedAt",
    "claimVersionIds",
    "operation",
    "producerTaskId",
    "reviewerTaskId",
    "approved",
  ]);
  return {
    reviewerIdentity: string(o.reviewerIdentity, "reviewerIdentity"),
    sourceChecks: array(o.sourceChecks, "sourceChecks").map((value, index) => {
      const s = object(value, `sourceChecks[${index}]`);
      return {
        findingId: string(s.findingId, `sourceChecks[${index}].findingId`),
        locatorVerified: bool(s.locatorVerified, `sourceChecks[${index}].locatorVerified`),
        supportsWording: bool(s.supportsWording, `sourceChecks[${index}].supportsWording`),
        limitationsPreserved: bool(
          s.limitationsPreserved,
          `sourceChecks[${index}].limitationsPreserved`
        ),
      };
    }),
    decision: enumValue(
      o.decision,
      ["approve", "qualify", "revise", "defer", "reject"] as const,
      "decision"
    ),
    findings: array(o.findings, "findings").map((value, index) => {
      const f = object(value, `findings[${index}]`);
      return {
        code: string(f.code, `findings[${index}].code`),
        severity: enumValue(
          f.severity,
          ["low", "medium", "critical"] as const,
          `findings[${index}].severity`
        ),
        location: string(f.location, `findings[${index}].location`),
        reason: string(f.reason, `findings[${index}].reason`),
        correction: string(f.correction, `findings[${index}].correction`),
      };
    }),
    policyVersion: string(o.policyVersion, "policyVersion"),
    providerMetadata: object(o.providerMetadata, "providerMetadata"),
  };
}
export function parseBriefDrafts(value: unknown): C.BriefDraft[] {
  const o = object(value);
  return array(o.briefs, "briefs").map((value, index) => {
    const b = object(value, `briefs[${index}]`);
    noOwnedFields(b, `briefs[${index}]`, [
      "id",
      "schemaVersion",
      "createdAt",
      "updatedAt",
      "topicId",
      "synthesisVersionId",
      "claimVersionIds",
      "status",
      "approved",
    ]);
    const action = object(b.action, `briefs[${index}].action`);
    return {
      kind: enumValue(b.kind, ["text", "image", "video"] as const, `briefs[${index}].kind`),
      angle: string(b.angle, `briefs[${index}].angle`),
      intendedTakeaway: string(b.intendedTakeaway, `briefs[${index}].intendedTakeaway`),
      action: {
        textBn: string(action.textBn, `briefs[${index}].action.textBn`),
        basis: enumValue(
          action.basis,
          ["guidance", "evidence", "suggestion"] as const,
          `briefs[${index}].action.basis`
        ),
      },
      ageSegment: string(b.ageSegment, `briefs[${index}].ageSegment`),
      fingerprint: string(b.fingerprint, `briefs[${index}].fingerprint`),
    };
  });
}
export function isClaimVersion(value: unknown): value is C.ClaimVersion {
  try {
    parseClaimVersion(value);
    return true;
  } catch {
    return false;
  }
}
