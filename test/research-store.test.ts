import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ResearchRepository } from "../src/research/repository.ts";
import { Store } from "../src/store.ts";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "sfurti-research-store-"));
  return { directory, path: join(directory, "fixture.sqlite") };
}

test("v1 data survives additive research migration and reopening", async () => {
  const { directory, path } = await fixture();
  try {
    const v1 = new DatabaseSync(path);
    v1.exec(
      'CREATE TABLE artifacts (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data))); INSERT INTO artifacts VALUES (\'old\', \'{"id":"old","kind":"video"}\');'
    );
    v1.close();
    const store = new Store(path);
    assert.deepEqual(store.get("artifacts", "old"), { id: "old", kind: "video" });
    store.close();
    const reopened = new Store(path);
    assert.deepEqual(reopened.get("artifacts", "old"), { id: "old", kind: "video" });
    reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("claim, event, and memory outbox commit atomically", async () => {
  const { directory, path } = await fixture();
  try {
    const store = new Store(path);
    const repository = new ResearchRepository(store);
    const base = {
      schemaVersion: 1 as const,
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    };
    repository.saveClaimWithMemoryJob(
      {
        ...base,
        id: "claim-1",
        revision: 1,
        previousVersionId: null,
        topicId: "topic",
        synthesisVersionId: "syn",
        kind: "evidence",
        wordingBn: "x",
        allowedParaphraseRules: [],
        forbiddenOverstatements: [],
        findingIds: [],
        parentClaimIds: [],
        scope: { ages: null, region: null, context: "x" },
        certainty: "low",
        certaintyReasons: [],
        status: "draft",
        reviewId: null,
        validUntil: null,
        lastCheckedAt: null,
        missionRelevance: "x",
        attribution: null,
      },
      {
        ...base,
        id: "memory-1",
        entityType: "claim",
        entityVersionId: "claim-1",
        dataset: "approved_claim",
        operation: "upsert",
        status: "pending",
        idempotencyKey: "claim-1",
        leaseOwner: null,
        leaseUntil: null,
        attempts: 0,
        nextRunAt: "2026-09-10T00:00:00.000Z",
        remoteIds: [],
        error: null,
      }
    );
    assert.equal(repository.dueTasks("2026-09-10T00:00:00.000Z").length, 1);
    assert.throws(
      () =>
        store.transaction(() => {
          store.put("research_claims", { id: "rollback" });
          throw new Error("fail");
        }),
      /fail/
    );
    assert.equal(store.get("research_claims", "rollback"), undefined);
    store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
