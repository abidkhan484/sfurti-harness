import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FacebookGraph } from "../src/adapters/facebook.ts";
import { AdapterError } from "../src/adapters/process.ts";

test("Graph transport uses an explicit version and preview blocks mutation before HTTP", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-facebook-"));
  try {
    const tokenFile = join(root, "token");
    await writeFile(tokenFile, "synthetic-token");
    let calls = 0;
    const adapter = new FacebookGraph(
      {
        kind: "graph",
        pageId: "page",
        graphApiVersion: "v26.0",
        tokenFile,
        executionMode: "preview",
      },
      {
        request: async () => {
          calls++;
          return { status: 200, json: { id: "remote" } };
        },
      }
    );
    await assert.rejects(
      adapter.submit({ id: "post", message: "Bangla" }),
      (e: unknown) => e instanceof AdapterError && /preview/.test(e.message)
    );
    assert.equal(calls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Graph transport journals intent and sends documented Page feed request through fake HTTP", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-facebook-"));
  try {
    const tokenFile = join(root, "token");
    await writeFile(tokenFile, "synthetic-token");
    const records: unknown[] = [];
    let request!: { url: string; body: { published: boolean } };
    const adapter = new FacebookGraph(
      { kind: "graph", pageId: "page", graphApiVersion: "v26.0", tokenFile, executionMode: "live" },
      {
        request: async (input) => {
          request = input as typeof request;
          return { status: 200, json: { id: "remote-post" } };
        },
      },
      {
        put: (_collection, value) => {
          records.push(value);
          return value;
        },
      }
    );
    adapter.setAuthorizationVerifier(() => {});
    const result = await adapter.submit({
      id: "post",
      message: "বাংলা",
      scheduledAt: "2026-09-15T10:00:00Z",
      publicationAuthorization: {
        operation: "submit",
        pageId: "page",
        requestId: "fixture",
        artifactHash: "fixture",
      },
    });
    assert.equal(result.status, "scheduled");
    assert.equal(result.remoteId, "remote-post");
    assert.equal(request.url, "https://graph.facebook.com/v26.0/page/feed");
    assert.equal(request.body.published, false);
    assert.equal(records.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("photo submission rejects local paths and keeps the documented Page post identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "sfurti-facebook-"));
  try {
    const tokenFile = join(root, "token");
    await writeFile(tokenFile, "synthetic-token");
    const adapter = new FacebookGraph(
      { kind: "graph", pageId: "page", graphApiVersion: "v26.0", tokenFile, executionMode: "live" },
      {
        request: async (input) => {
          assert.equal(input.url, "https://graph.facebook.com/v26.0/page/photos");
          return { status: 200, json: { id: "photo", post_id: "post" } };
        },
      }
    );
    adapter.setAuthorizationVerifier(() => {});
    await assert.rejects(adapter.submitPhoto({ id: "p" }, "/media/photo.png"), /HTTPS/);
    assert.deepEqual(
      await adapter.submitPhoto(
        {
          id: "p",
          publicationAuthorization: {
            operation: "submit",
            pageId: "page",
            requestId: "fixture",
            artifactHash: "fixture",
          },
        },
        "https://cdn.example/photo.png"
      ),
      { remoteId: "post", photoId: "photo", status: "published" }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
