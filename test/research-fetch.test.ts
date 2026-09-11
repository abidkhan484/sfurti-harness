import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HttpCollector, type StreamHttpResponse } from "../src/adapters/collection/http.ts";
import { publicUrlAccess } from "../src/research/url-policy.ts";

const instant = "2026-09-10T00:00:00.000Z";
const clock = { now: () => new Date(instant) };
const publicResolver = async () => ["93.184.216.34"];
const chunks = (...items: string[]): AsyncIterable<Uint8Array> =>
  (async function* () {
    for (const item of items) yield Buffer.from(item);
  })();

async function fixture(response: StreamHttpResponse | StreamHttpResponse[]) {
  const directory = await mkdtemp(join(tmpdir(), "sfurti-fetch-"));
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const queue = Array.isArray(response) ? [...response] : [response];
  const collector = new HttpCollector({
    snapshotDirectory: directory,
    maxDocumentBytes: 64,
    timeoutMs: 1000,
    requestsPerHostPerMinute: 60,
    resolveHost: publicResolver,
    clock,
    transport: {
      request: async (request) => {
        calls.push({ url: request.url, headers: request.headers });
        const result = queue.shift();
        if (!result) throw new Error("unexpected request");
        return result;
      },
    },
  });
  return { directory, calls, collector };
}

test("collection conditionally checks a known version and 304 changes only its checkpoint", async () => {
  const { directory, calls, collector } = await fixture({
    status: 304,
    headers: { etag: "new-etag", "last-modified": "Wed, 10 Sep 2026 00:00:00 GMT" },
  });
  try {
    const result = await collector.fetch({
      url: "https://source.example/article",
      sourceId: "source-1",
      previousEtag: "known-etag",
      previousModified: "Tue, 09 Sep 2026 00:00:00 GMT",
      signal: new AbortController().signal,
    });
    assert.equal(result.status, "not_modified");
    assert.deepEqual(result.checkpoint, { checkedAt: instant });
    assert.equal(calls[0].headers["if-none-match"], "known-etag");
    assert.equal(calls[0].headers["if-modified-since"], "Tue, 09 Sep 2026 00:00:00 GMT");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("collection streams an allowed snapshot to a hash-derived path", async () => {
  const { directory, collector } = await fixture({
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", etag: "v2" },
    body: chunks("SYNTHETIC ", "TEST DATA: changed body"),
  });
  try {
    const result = await collector.fetch({
      url: "https://source.example/a",
      sourceId: "s",
      signal: new AbortController().signal,
    });
    assert.equal(result.status, "ok");
    assert.equal(result.mime, "text/html");
    assert.match(result.checkpoint.contentHash ?? "", /^[a-f0-9]{64}$/);
    assert.match(result.checkpoint.snapshotPath ?? "", /\/[a-f0-9]{64}\.html$/);
    assert.equal(
      await readFile(result.checkpoint.snapshotPath!, "utf8"),
      "SYNTHETIC TEST DATA: changed body"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("oversized streamed chunks and unsupported MIME are blocked before ingestion", async () => {
  const { directory, collector } = await fixture([
    { status: 200, headers: { "content-type": "image/jpeg" }, body: chunks("SYNTHETIC TEST DATA") },
    { status: 200, headers: { "content-type": "text/html" }, body: chunks("x".repeat(65)) },
  ]);
  try {
    const first = await collector.fetch({
      url: "https://one.example/a",
      sourceId: "s",
      signal: new AbortController().signal,
    });
    const second = await collector.fetch({
      url: "https://two.example/a",
      sourceId: "s",
      signal: new AbortController().signal,
    });
    assert.equal(first.reason, "unsupported_mime");
    assert.equal(second.reason, "document_too_large");
    assert.equal(second.checkpoint.contentHash, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("redirect destinations are resolved and private or metadata targets never reach transport", async () => {
  const { directory, calls, collector } = await fixture({
    status: 302,
    headers: { location: "http://169.254.169.254/latest/meta-data" },
  });
  try {
    const result = await collector.fetch({
      url: "https://source.example/a",
      sourceId: "s",
      signal: new AbortController().signal,
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "private_or_unresolvable_destination");
    assert.equal(calls.length, 1);
    assert.equal(
      (await publicUrlAccess("https://metadata.google.internal/a", publicResolver)).allowed,
      false
    );
    assert.equal((await publicUrlAccess("https://localhost/a", publicResolver)).allowed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("429 preserves retry checkpoint and host failures do not pace an independent host", async () => {
  const { directory, collector } = await fixture([
    { status: 429, headers: { "retry-after": "120" } },
    { status: 200, headers: { "content-type": "text/html" }, body: chunks("SYNTHETIC TEST DATA") },
  ]);
  try {
    const limited = await collector.fetch({
      url: "https://limited.example/a",
      sourceId: "s",
      signal: new AbortController().signal,
    });
    const independent = await collector.fetch({
      url: "https://other.example/a",
      sourceId: "s",
      signal: new AbortController().signal,
    });
    assert.equal(limited.reason, "rate_limited");
    assert.equal(limited.nextRunAt, "2026-09-10T00:02:00.000Z");
    assert.equal(independent.status, "ok");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("robots and collection policy deny with an auditable reason", async () => {
  const { directory } = await fixture({
    status: 200,
    headers: { "content-type": "text/html" },
    body: chunks("unused"),
  });
  const collector = new HttpCollector({
    snapshotDirectory: directory,
    maxDocumentBytes: 64,
    timeoutMs: 1000,
    requestsPerHostPerMinute: 60,
    resolveHost: publicResolver,
    clock,
    robots: { check: () => ({ allowed: false, reason: "robots_disallow" }) },
    transport: {
      request: async () => {
        throw new Error("must not fetch");
      },
    },
  });
  try {
    const result = await collector.fetch({
      url: "https://robots.example/a",
      sourceId: "s",
      signal: new AbortController().signal,
    });
    assert.deepEqual(
      { status: result.status, reason: result.reason },
      { status: "blocked", reason: "robots_disallow" }
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
