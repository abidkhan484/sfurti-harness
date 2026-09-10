import assert from "node:assert/strict";
import test from "node:test";
import { AdapterError } from "../src/adapters/process.ts";
import {
  EuropePmcSearch,
  normalizeDoi,
  scholarlyIdentity,
  type EuropePmcHit,
} from "../src/adapters/search/europe-pmc.ts";
import type { HttpTransport } from "../src/adapters/search/searxng.ts";

function fixtureTransport(
  responses: { status: number; body: string; headers?: Record<string, string> }[]
) {
  const calls: string[] = [];
  const transport: HttpTransport = {
    request: async ({ url }) => {
      calls.push(url);
      const response = responses.shift();
      if (!response) throw new Error("unexpected request");
      return response;
    },
  };
  return { transport, calls };
}

test("Europe PMC maps core metadata, encoded cursors, and concrete access links", async () => {
  const { transport, calls } = fixtureTransport([
    {
      status: 200,
      body: JSON.stringify({
        resultList: {
          result: [
            {
              id: "12345",
              source: "MED",
              title: "শিশুদের গবেষণা",
              abstractText: "SYNTHETIC TEST DATA: an abstract, not full paper text.",
              doi: "https://doi.org/10.1000/AbC.1.",
              firstPublicationDate: "2026-01-03",
              authorString: "Rahman A, Smith B",
              authorList: { author: [{ fullName: "Rahman, A" }, { fullName: "Smith, B" }] },
              isOpenAccess: "Y",
              fullTextUrlList: {
                fullTextUrl: [
                  {
                    url: "https://example.org/paper.pdf",
                    availability: "Free",
                    site: "Europe_PMC",
                  },
                  {
                    url: "https://publisher.example/article",
                    availability: "Subscription required",
                    site: "Publisher",
                  },
                ],
              },
            },
          ],
        },
        nextCursorMark: "AoII123+%3D",
      }),
    },
  ]);
  const adapter = new EuropePmcSearch({ baseUrl: "https://epmc.local/rest", transport });
  const result = await adapter.search({
    query: "শিশুর মনোযোগ & শিক্ষা",
    language: "bn-BD",
    limit: 10,
    signal: new AbortController().signal,
  });
  assert.match(calls[0], /\/rest\/search\?query=%E0%A6%B6/);
  assert.match(calls[0], /format=json/);
  assert.match(calls[0], /resultType=core/);
  assert.match(calls[0], /pageSize=10/);
  assert.match(calls[0], /cursorMark=\*/);
  assert.deepEqual(result, {
    hits: [
      {
        url: "https://europepmc.org/article/MED/12345",
        title: "শিশুদের গবেষণা",
        snippet: "SYNTHETIC TEST DATA: an abstract, not full paper text.",
        publishedAt: "2026-01-03T00:00:00.000Z",
        providerId: "MED:12345",
        doi: "10.1000/abc.1",
        source: "MED",
        sourceId: "12345",
        authorNames: ["Rahman, A", "Smith, B"],
        authorString: "Rahman A, Smith B",
        access: "open_access",
        accessLinks: [
          { url: "https://example.org/paper.pdf", availability: "Free", kind: "full_text" },
          {
            url: "https://publisher.example/article",
            availability: "Subscription required",
            kind: "publisher",
          },
        ],
      },
    ],
    nextCursor: "AoII123+%3D",
    coverage: { partial: false },
  });
});

test("Europe PMC cursor stops when exhausted and retains abstract/no-DOI access states", async () => {
  const { transport, calls } = fixtureTransport([
    {
      status: 200,
      body: JSON.stringify({
        resultList: {
          result: [
            {
              id: "A1",
              source: "PPR",
              title: "Abstract-only preprint",
              abstractText: "SYNTHETIC TEST DATA",
              pubYear: "2025",
              authorString: "Author A",
            },
            {
              id: "A2",
              source: "MED",
              title: "Linked but not marked OA",
              fullTextUrlList: {
                fullTextUrl: [{ url: "https://example.test/record", site: "Publisher" }],
              },
            },
          ],
        },
        nextCursorMark: "same-marker",
      }),
    },
  ]);
  const adapter = new EuropePmcSearch({ baseUrl: "https://epmc.local/rest", transport });
  const result = await adapter.search({
    query: "test",
    language: "en",
    cursor: "same-marker",
    limit: 10,
    signal: new AbortController().signal,
  });
  assert.match(calls[0], /cursorMark=same-marker/);
  assert.equal(result.nextCursor, null);
  assert.deepEqual(
    result.hits.map(({ providerId, doi, access, snippet, accessLinks }) => ({
      providerId,
      doi,
      access,
      snippet,
      accessLinks,
    })),
    [
      {
        providerId: "PPR:A1",
        doi: null,
        access: "abstract",
        snippet: "SYNTHETIC TEST DATA",
        accessLinks: [],
      },
      {
        providerId: "MED:A2",
        doi: null,
        access: "link_available",
        snippet: "",
        accessLinks: [
          { url: "https://example.test/record", availability: null, kind: "publisher" },
        ],
      },
    ]
  );
});

test("Europe PMC DOI identity deduplicates reports while preserving provider provenance", () => {
  const webDoi = normalizeDoi("DOI:10.5555/Study-ABC.");
  const scholarly: EuropePmcHit = {
    url: "https://epmc.local/article/MED/9",
    title: "SYNTHETIC TEST DATA",
    snippet: "",
    publishedAt: null,
    providerId: "MED:9",
    doi: normalizeDoi("https://doi.org/10.5555/study-abc")!,
    source: "MED",
    sourceId: "9",
    authorNames: [],
    authorString: null,
    access: "abstract",
    accessLinks: [],
  };
  assert.equal(webDoi, scholarly.doi);
  assert.equal(scholarlyIdentity(scholarly), "doi:10.5555/study-abc");
  assert.equal(scholarly.providerId, "MED:9");
});

test("Europe PMC classifies protocol and durable rate-limit failures", async () => {
  for (const [response, expected] of [
    [{ status: 429, body: "slow", headers: { "retry-after": "2" } }, "rate_limit"],
    [{ status: 200, body: "<html>not JSON</html>" }, "protocol"],
  ] as const) {
    const { transport } = fixtureTransport([response]);
    const adapter = new EuropePmcSearch({ baseUrl: "https://epmc.local/rest", transport });
    await assert.rejects(
      adapter.search({
        query: "test",
        language: "en",
        limit: 10,
        signal: new AbortController().signal,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AdapterError);
        assert.equal(error.kind, expected);
        if (expected === "rate_limit") assert.equal(error.retryAfterMs, 2_000);
        return true;
      }
    );
  }
});
