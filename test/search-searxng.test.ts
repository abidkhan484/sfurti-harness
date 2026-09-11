import assert from "node:assert/strict";
import test from "node:test";
import { AdapterError } from "../src/adapters/process.ts";
import {
  normalizeSearchUrl,
  SearxngSearch,
  type HttpTransport,
} from "../src/adapters/search/searxng.ts";

function fixtureTransport(response: {
  status: number;
  body: string;
  headers?: Record<string, string>;
}) {
  const calls: { url: string; signal: AbortSignal }[] = [];
  const transport: HttpTransport = {
    request: async (request) => {
      calls.push({ url: request.url, signal: request.signal });
      return response;
    },
  };
  return { transport, calls };
}

test("SearXNG maps Unicode JSON discovery results and a deterministic next cursor", async () => {
  const { transport, calls } = fixtureTransport({
    status: 200,
    body: JSON.stringify({
      number_of_results: 21,
      results: [
        {
          url: "HTTPS://Example.COM:443/a?utm_source=x&b=2&a=1#fragment",
          title: "বাংলা শিরোনাম",
          content: "SYNTHETIC TEST DATA: discovery snippet only",
          publishedDate: "2026-09-01",
          engine: "duckduckgo",
        },
        { url: "https://two.example/path", title: "Second", content: "SYNTHETIC TEST DATA" },
        { url: "https://three.example/path", title: "Third", content: "SYNTHETIC TEST DATA" },
      ],
    }),
  });
  const adapter = new SearxngSearch({ baseUrl: "http://searx.local/base", transport });
  const result = await adapter.search({
    query: "শিশুর মনোযোগ",
    language: "bn-BD",
    cursor: "2",
    limit: 2,
    signal: new AbortController().signal,
  });
  assert.match(calls[0].url, /\/base\/search\?q=%E0%A6%B6/);
  assert.match(calls[0].url, /language=bn-BD/);
  assert.match(calls[0].url, /format=json/);
  assert.match(calls[0].url, /pageno=2/);
  assert.deepEqual(result, {
    hits: [
      {
        url: "https://example.com/a?a=1&b=2",
        title: "বাংলা শিরোনাম",
        snippet: "SYNTHETIC TEST DATA: discovery snippet only",
        publishedAt: "2026-09-01T00:00:00.000Z",
        providerId: "duckduckgo",
      },
      {
        url: "https://two.example/path",
        title: "Second",
        snippet: "SYNTHETIC TEST DATA",
        publishedAt: null,
      },
    ],
    nextCursor: "3",
    coverage: { partial: false },
  });
});

test("URL normalization removes only known tracking values and rejects unsafe URLs", () => {
  assert.equal(
    normalizeSearchUrl("http://EXAMPLE.com:80/a?z=1&utm_campaign=ignored&a=2#x"),
    "http://example.com/a?a=2&z=1"
  );
  assert.equal(normalizeSearchUrl("mailto:test@example.com"), null);
  assert.equal(normalizeSearchUrl("https://user:secret@example.com/"), null);
});

test("SearXNG classifies JSON-disabled, rate-limited and non-JSON responses", async () => {
  const signal = new AbortController().signal;
  for (const [response, expected] of [
    [{ status: 403, body: "forbidden" }, "configuration"],
    [{ status: 429, body: "slow down", headers: { "retry-after": "3" } }, "rate_limit"],
    [{ status: 200, body: "<html>not JSON</html>" }, "protocol"],
  ] as const) {
    const { transport } = fixtureTransport(response);
    const adapter = new SearxngSearch({ baseUrl: "https://searx.local", transport });
    await assert.rejects(
      adapter.search({ query: "query", language: "en", limit: 10, signal }),
      (error: unknown) => {
        assert.ok(error instanceof AdapterError);
        assert.equal(error.kind, expected);
        if (expected === "rate_limit") assert.equal(error.retryAfterMs, 3000);
        return true;
      }
    );
  }
});

test("SearXNG retains a classified partial result when engines or individual hits fail", async () => {
  const { transport } = fixtureTransport({
    status: 200,
    body: JSON.stringify({
      number_of_results: 1,
      unresponsive_engines: [["synthetic", "timeout"]],
      results: [
        { url: "javascript:alert(1)", title: "Unsafe", content: "SYNTHETIC TEST DATA" },
        { url: "https://valid.example", title: "Valid", content: "SYNTHETIC TEST DATA" },
      ],
    }),
  });
  const adapter = new SearxngSearch({ baseUrl: "https://searx.local", transport });
  assert.deepEqual(
    await adapter.search({
      query: "query",
      language: "en",
      limit: 10,
      signal: new AbortController().signal,
    }),
    {
      hits: [
        {
          url: "https://valid.example/",
          title: "Valid",
          snippet: "SYNTHETIC TEST DATA",
          publishedAt: null,
        },
      ],
      nextCursor: null,
      coverage: {
        partial: true,
        reason:
          "one or more configured search engines did not respond; SearXNG returned malformed results",
      },
    }
  );
});
