import assert from "node:assert/strict";
import test from "node:test";
import {
  parseClaimVersion,
  parseExtractionDraft,
  parseLocator,
  parseSearchPlanDraft,
  parseSynthesisDraft,
  parseTriageSource,
} from "../src/research/schemas.ts";

const envelope = {
  id: "opaque-id",
  schemaVersion: 1,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
};
const validClaim = {
  ...envelope,
  revision: 1,
  previousVersionId: null,
  topicId: "topic-1",
  synthesisVersionId: "synthesis-1",
  kind: "evidence",
  wordingBn: "একটি সীমিত সম্পর্ক দেখা গেছে।",
  allowedParaphraseRules: ["Keep association wording"],
  forbiddenOverstatements: ["Do not imply causation"],
  findingIds: ["finding-1"],
  parentClaimIds: [],
  scope: { ages: { min: 6, max: 9 }, region: null, context: "observational study" },
  certainty: "low",
  certaintyReasons: ["confounding"],
  status: "draft",
  reviewId: null,
  validUntil: null,
  lastCheckedAt: null,
  missionRelevance: "parent question",
  attribution: null,
};

test("research records preserve null unknowns and provenance", () => {
  const source = parseTriageSource({
    ...envelope,
    canonicalOrigin: "https://example.test",
    kind: "web",
    access: "public",
    collectionState: "candidate",
    quality: "unassessed",
    rationale: "Synthetic test source",
    firstDiscoveredQueryId: "query-1",
    lastCheckedAt: null,
    policyVersion: "policy-1",
  });
  assert.equal(source.lastCheckedAt, null);
  const claim = parseClaimVersion(validClaim);
  assert.equal(claim.status, "draft");
});

test("agent drafts cannot claim application-owned approval or audit fields", () => {
  assert.throws(
    () =>
      parseSynthesisDraft({
        claims: [
          {
            id: "invented",
            kind: "evidence",
            wordingBn: "x",
            allowedParaphraseRules: [],
            forbiddenOverstatements: [],
            findingIds: ["f"],
            parentClaimIds: [],
            scope: { ages: null, region: null, context: "c" },
            certainty: "low",
            certaintyReasons: ["r"],
            missionRelevance: "m",
            attribution: null,
          },
        ],
        conflicts: [],
        limitations: "l",
        decision: "ready",
      }),
    /application-owned/
  );
});

test("parsers reject invalid locators, status, certainty, and oversized model output", () => {
  assert.throws(() => parseLocator({ start: 4, end: 4 }), /greater than start/);
  assert.throws(() => parseClaimVersion({ ...validClaim, revision: 0 }), /revision/);
  assert.throws(() => parseClaimVersion({ ...validClaim, certainty: "certain" }), /certainty/);
  assert.throws(() => parseClaimVersion({ ...validClaim, status: "made_up" }), /status/);
  assert.throws(
    () =>
      parseSearchPlanDraft({ queries: Array.from({ length: 101 }, () => ({})), nextQuestions: [] }),
    /at most/
  );
  assert.throws(
    () => parseExtractionDraft({ items: [{ kind: "unknown" }], findings: [] }),
    /unknown value/
  );
});
