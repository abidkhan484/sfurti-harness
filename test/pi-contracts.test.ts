import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOperationJournal,
  parseQualification,
  parseRecommendation,
  parseSetupReceipt,
  parseSourceSubmission,
} from "../src/deployment/contracts.ts";

const submission = {
  schemaVersion: 1,
  submissionId: "sample-1",
  sourceId: "source-1",
  originalUrl: "https://example.test/v",
  title: "Owned video",
  language: "bn",
  videoFile: "video.mp4",
  permission: { evidenceFile: "permission.pdf", scope: ["edit", "facebook"], restrictions: [] },
};

test("Pi durable contracts round trip valid records", () => {
  assert.deepEqual(parseSourceSubmission(submission), submission);
  assert.equal(
    parseRecommendation({
      id: "r",
      sourceId: "s",
      canonicalUrl: "https://example.test",
      title: "t",
      language: null,
      topic: "x",
      rationaleBn: "কারণ",
      observedEvidence: [],
      tentativeSegments: [],
      limitations: [],
      discoveredAt: "2026-01-01T00:00:00.000Z",
      batchId: "b",
    }).id,
    "r"
  );
  assert.equal(
    parseQualification({
      sourceId: "s",
      sourceSha256: "a",
      missionVersion: "m",
      topic: "t",
      topics: ["t"],
      segments: [{ startMs: 0, endMs: 30000 }],
      evidencePath: "/app/data/e",
      evidenceSha256: "e",
      reviewerIdentity: "reviewer",
      qualifiedAt: "2026-01-01T00:00:00.000Z",
      relevant: true,
      credible: true,
      actualContentReviewed: true,
      locallyRelevant: true,
      limitations: [],
    }).segments.length,
    1
  );
  assert.equal(
    parseSetupReceipt({
      id: "x",
      schemaVersion: 1,
      target: "codex",
      kind: "inference",
      checkedAt: "2026-01-01T00:00:00.000Z",
      outcome: "passed",
      configFingerprint: "c",
      identityFingerprint: "i",
      evidencePaths: [],
      limitations: [],
    }).outcome,
    "passed"
  );
  assert.equal(
    parseOperationJournal({
      operationId: "o",
      destinationIdentity: "d",
      selectedArtifactHash: "h",
      phase: "intent",
      requestFingerprint: "r",
      attempt: 0,
      remoteIds: [],
      lastConfirmedState: "none",
      uncertainty: false,
    }).operationId,
    "o"
  );
});

test("Pi contracts reject unsupported permission, enums, dates, and interval overlap", () => {
  assert.throws(
    () =>
      parseSourceSubmission({
        ...submission,
        permission: { ...submission.permission, scope: ["edit"] },
      }),
    /facebook/
  );
  assert.throws(
    () =>
      parseSetupReceipt({
        id: "x",
        schemaVersion: 1,
        target: "x",
        kind: "x",
        checkedAt: "no",
        outcome: "made-up",
        configFingerprint: "x",
        identityFingerprint: "x",
        evidencePaths: [],
        limitations: [],
      }),
    /invalid/
  );
  assert.throws(
    () =>
      parseQualification({
        sourceId: "s",
        sourceSha256: "a",
        missionVersion: "m",
        topic: "t",
        topics: ["t"],
        segments: [
          { startMs: 0, endMs: 30000 },
          { startMs: 20000, endMs: 40000 },
        ],
        evidencePath: "e",
        evidenceSha256: "e",
        reviewerIdentity: "r",
        qualifiedAt: "2026-01-01T00:00:00.000Z",
        relevant: true,
        credible: true,
        actualContentReviewed: true,
        locallyRelevant: true,
        limitations: [],
      }),
    /overlap/
  );
});
