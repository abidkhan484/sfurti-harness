import assert from "node:assert/strict";
import test from "node:test";
import { AdapterError } from "../src/adapters/process.ts";
import {
  CogneeMemory,
  type CogneeHttpResponse,
  type CogneeProtocol,
} from "../src/adapters/memory/cognee.ts";

const signal = new AbortController().signal;

function protocol(version = "sfurti-cognee-http/verified-fixture-1"): CogneeProtocol {
  const request = (path: string, body?: unknown) => ({
    method: body === undefined ? ("GET" as const) : ("POST" as const),
    path,
    ...(body === undefined ? {} : { body }),
  });
  return {
    release: "fixture-release-1",
    apiVersion: version,
    requiredCapabilities: ["memory.upsert", "memory.status", "memory.search", "memory.remove"],
    health: { request: () => request("/api/health"), response: health },
    upsert: { request: (input) => request("/api/remember", input), response: job },
    status: {
      request: (input) => request(`/api/jobs/${encodeURIComponent(input.jobId)}`),
      response: status,
    },
    search: { request: (input) => request("/api/search", input), response: search },
    remove: { request: (input) => request("/api/remove", input), response: removal },
  };
}
function health(value: unknown) {
  const data = value as { apiVersion: string; capabilities: string[] };
  return { version: data.apiVersion, capabilities: data.capabilities };
}
function job(value: unknown) {
  const data = value as { job: { id: string; state: "pending" | "ready" } };
  return { jobId: data.job.id, state: data.job.state };
}
function status(value: unknown) {
  const data = value as { job: { state: "pending" | "ready" | "failed"; remoteIds: string[] } };
  return data.job;
}
function search(value: unknown) {
  const data = value as { matches: unknown[]; partial?: boolean };
  return { hits: data.matches as never[], partial: data.partial === true };
}
function removal(value: unknown) {
  const data = value as { removal: { state: "pending" | "ready" } };
  return data.removal;
}

function fixture(responses: Record<string, CogneeHttpResponse | CogneeHttpResponse[]>) {
  const calls: { url: string; body?: string; headers: Record<string, string> }[] = [];
  const queue = new Map(
    Object.entries(responses).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : [value],
    ])
  );
  return {
    calls,
    transport: {
      request: async (request: { url: string; body?: string; headers: Record<string, string> }) => {
        calls.push({ url: request.url, body: request.body, headers: request.headers });
        const key = new URL(request.url).pathname;
        const next = queue.get(key)?.shift();
        if (!next) throw new Error(`missing synthetic response for ${key}`);
        return next;
      },
    },
  };
}
const response = (body: unknown, status = 200): CogneeHttpResponse => ({
  status,
  body: JSON.stringify(body),
});
const healthResponse = () =>
  response({
    apiVersion: "sfurti-cognee-http/verified-fixture-1",
    capabilities: ["memory.upsert", "memory.status", "memory.search", "memory.remove"],
  });
const metadata = {
  entityVersionId: "claim-v1",
  schemaVersion: 1,
  contentHash: "a".repeat(64),
  locator: "paragraph:1",
};

test("Cognee maps a reviewed explicit protocol and preserves asynchronous indexing lifecycle", async () => {
  const { transport, calls } = fixture({
    "/api/health": [
      healthResponse(),
      healthResponse(),
      healthResponse(),
      healthResponse(),
      healthResponse(),
    ],
    "/api/remember": response({ job: { id: "job-1", state: "pending" } }),
    "/api/jobs/job-1": response({ job: { state: "pending", remoteIds: [] } }),
    "/api/jobs/job-2": response({ job: { state: "ready", remoteIds: ["remote-1"] } }),
    "/api/jobs/job-3": response({ job: { state: "failed", remoteIds: [] } }),
    "/api/remove": response({ removal: { state: "pending" } }),
  });
  const memory = new CogneeMemory({
    baseUrl: "http://127.0.0.1:18000",
    token: "never-log-this",
    protocol: protocol(),
    transport,
  });
  assert.deepEqual(
    await memory.upsert({
      dataset: "sfurti-approved-claims-v1",
      entityVersionId: "claim-v1",
      text: "SYNTHETIC TEST DATA",
      metadata,
      idempotencyKey: "upsert-1",
      signal,
    }),
    { jobId: "job-1", state: "pending" }
  );
  assert.deepEqual(await memory.status({ jobId: "job-1", signal }), {
    state: "pending",
    remoteIds: [],
  });
  assert.deepEqual(await memory.status({ jobId: "job-2", signal }), {
    state: "ready",
    remoteIds: ["remote-1"],
  });
  assert.deepEqual(await memory.status({ jobId: "job-3", signal }), {
    state: "failed",
    remoteIds: [],
  });
  assert.deepEqual(
    await memory.remove({
      entityVersionId: "claim-v1",
      remoteIds: ["remote-1"],
      idempotencyKey: "remove-1",
      signal,
    }),
    { state: "pending" }
  );
  assert.equal(
    calls.find((call) => call.url.endsWith("/api/remember"))?.headers.authorization,
    "Bearer never-log-this"
  );
  assert.doesNotMatch(
    JSON.stringify(calls.map(({ url, body }) => ({ url, body }))),
    /never-log-this/
  );
});

test("Cognee routes datasets, rejects unsupported provenance, and excludes generated answers without entity IDs", async () => {
  const { transport, calls } = fixture({
    "/api/health": [healthResponse(), healthResponse()],
    "/api/search": response({
      matches: [
        {
          entityVersionId: "claim-v1",
          documentVersionId: "document-v1",
          locator: "paragraph:1",
          score: 0.99,
        },
        { answer: "SYNTHETIC GENERATED ANSWER WITHOUT PROVENANCE", score: 1 },
      ],
    }),
  });
  const memory = new CogneeMemory({
    baseUrl: "http://127.0.0.1:18000",
    protocol: protocol(),
    transport,
  });
  assert.deepEqual(
    await memory.search({ datasets: ["sfurti-evidence-v1"], query: "query", limit: 10, signal }),
    {
      hits: [
        {
          entityVersionId: "claim-v1",
          documentVersionId: "document-v1",
          locator: "paragraph:1",
          score: 0.99,
        },
      ],
      partial: true,
    }
  );
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.endsWith("/api/search"))!.body!), {
    datasets: ["sfurti-evidence-v1"],
    query: "query",
    limit: 10,
  });
  await assert.rejects(
    memory.search({
      datasets: ["untrusted-session-memory" as never],
      query: "query",
      limit: 10,
      signal,
    }),
    AdapterError
  );
  await assert.rejects(
    memory.upsert({
      dataset: "sfurti-evidence-v1",
      entityVersionId: "claim-v1",
      text: "x",
      metadata: { ...metadata, entityVersionId: "other" },
      idempotencyKey: "key",
      signal,
    }),
    (error: unknown) => error instanceof AdapterError && error.kind === "rejected"
  );
});

test("Cognee fails closed for incompatible releases and redacts credential failures", async () => {
  const { transport } = fixture({
    "/api/health": response({ apiVersion: "changed-api", capabilities: ["memory.upsert"] }),
  });
  const memory = new CogneeMemory({
    baseUrl: "http://127.0.0.1:18000",
    token: "top-secret",
    protocol: protocol(),
    transport,
  });
  await assert.rejects(memory.health({ signal }), (error: unknown) => {
    assert.ok(error instanceof AdapterError);
    assert.equal(error.kind, "protocol");
    assert.doesNotMatch(error.message, /top-secret/);
    return true;
  });
});
