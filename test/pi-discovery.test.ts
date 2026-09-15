import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHarness } from "../src/app.ts";
import { LocalDiscovery } from "../src/adapters/local/discovery.ts";

test("metadata-only discovery produces stable unqualified recommendations and queued guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-pi-discovery-"));
  try {
    let calls = 0;
    const adapter = new LocalDiscovery({
      endpoint: "http://searx.test",
      queriesPerBatch: 1,
      resultsPerQuery: 5,
      maxRecommendationsPerTopic: 5,
      minRequestSpacingMs: 0,
      transport: {
        request: async () => {
          calls++;
          return {
            status: 200,
            body: JSON.stringify({
              results: [
                {
                  url: "https://example.test/video?utm_source=x",
                  title: "কাগজের কাজ",
                  content: "SYNTHETIC TEST DATA",
                },
                { url: "https://example.test/video", title: "duplicate", content: "duplicate" },
              ],
            }),
          };
        },
      },
    });
    const app = createHarness({
      config: {
        storage: { databasePath: join(root, "db.sqlite"), mediaDirectory: join(root, "media") },
      },
      adapters: { discovery: adapter },
    });
    const result = (await app.execute({ type: "discover", requestId: "daily" })) as {
      recommendations: Array<{ tentativeSegments: unknown[] }>;
      sources: Array<{ metadata: { qualified: boolean } }>;
    };
    assert.equal(result.recommendations.length, 1);
    assert.equal(result.sources[0].metadata.qualified, false);
    assert.deepEqual(result.recommendations[0].tentativeSegments, []);
    assert.equal(calls, 1);
    assert.equal(
      (
        (await app.execute({ type: "discover", requestId: "daily" })) as {
          recommendations: unknown[];
        }
      ).recommendations.length,
      1
    );
    const state = (await app.execute({ type: "status" })) as {
      notifications: Array<{ event: { message: string } }>;
    };
    assert.equal(state.notifications.length, 1);
    assert.match(state.notifications[0].event.message, /অনুমতি/);
    app.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovery records partial coverage for disabled JSON or rate limiting without inventing candidates", async () => {
  const adapter = new LocalDiscovery({
    endpoint: "http://searx.test",
    queriesPerBatch: 1,
    resultsPerQuery: 5,
    maxRecommendationsPerTopic: 5,
    minRequestSpacingMs: 0,
    transport: { request: async () => ({ status: 403, body: "disabled" }) },
  });
  const result = (await adapter.discover({
    topic: "খেলা",
    language: "bn",
    idempotencyKey: "blocked",
  })) as { recommendations: unknown[]; coverage: { partial: boolean } };
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.coverage.partial, true);
});

test("explicit discovery probe performs one bounded read", async () => {
  let calls = 0;
  const adapter = new LocalDiscovery({
    endpoint: "http://searx.test",
    queriesPerBatch: 1,
    resultsPerQuery: 1,
    maxRecommendationsPerTopic: 1,
    minRequestSpacingMs: 0,
    transport: {
      request: async () => {
        calls++;
        return { status: 200, body: JSON.stringify({ results: [] }) };
      },
    },
  });
  assert.deepEqual(await adapter.probe(), { partial: false, hitCount: 0 });
  assert.equal(calls, 1);
});
