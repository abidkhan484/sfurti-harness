import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FacebookGraph, type ReelState } from "../src/adapters/facebook.ts";
import { AdapterError } from "../src/adapters/process.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "sfurti-reels-"));
  const tokenFile = join(root, "token"),
    video = join(root, "clip.mp4");
  await writeFile(tokenFile, "synthetic-token");
  await writeFile(video, "synthetic-reel-bytes");
  return {
    root,
    tokenFile,
    video,
    hash: createHash("sha256")
      .update(await readFile(video))
      .digest("hex"),
  };
}

test("Reel upload uses documented explicit-version paths and upload acknowledgement is not publication", async () => {
  const f = await fixture();
  try {
    const calls: { url: string; headers: Record<string, string>; body?: unknown }[] = [],
      journal: unknown[] = [];
    const replies = [
      { video_id: "video-1", upload_url: "https://ignored.example/upload" },
      { success: true },
      { status: { video_status: "processing" } },
      { success: true },
      { status: { video_status: "processing" } },
    ];
    const graph = new FacebookGraph(
      {
        kind: "graph",
        pageId: "page",
        graphApiVersion: "v26.0",
        tokenFile: f.tokenFile,
        executionMode: "live",
      },
      {
        request: async (input) => {
          calls.push(input);
          return { status: 200, json: replies.shift()! };
        },
      },
      {
        put: (_collection, value) => {
          journal.push(value);
          return value;
        },
      }
    );
    graph.setAuthorizationVerifier(() => {});
    const state = await graph.submitReel(
      {
        id: "post-1",
        artifactHash: f.hash,
        caption: "বাংলা",
        publicationAuthorization: {
          operation: "submit",
          pageId: "page",
          requestId: "fixture",
          artifactHash: f.hash,
        },
      },
      f.video
    );
    assert.equal(state.phase, "processing");
    assert.equal(state.offset, 20);
    assert.equal(calls[0].url, "https://graph.facebook.com/v26.0/page/video_reels");
    assert.equal(calls[1].url, "https://rupload.facebook.com/video-upload/v26.0/video-1");
    assert.equal(calls[1].headers["Content-Type"], "application/octet-stream");
    assert.equal(calls[1].headers.offset, "0");
    assert.equal(calls[1].headers.file_size, "20");
    assert.equal(calls[3].url, "https://graph.facebook.com/v26.0/page/video_reels");
    assert.deepEqual(await streamBytes(calls[1].body), Buffer.from("synthetic-reel-bytes"));
    assert.ok(
      journal.some((entry) => {
        const e = entry as { phase?: string; offset?: number };
        return e?.phase === "uploaded" && e?.offset === 20;
      })
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Reel restart resumes its known upload session without a second start", async () => {
  const f = await fixture();
  try {
    const calls: string[] = [];
    const state: ReelState = {
      id: "facebook:reel:post",
      pageId: "page",
      artifactHash: f.hash,
      phase: "uploading",
      videoId: "video-1",
      uploadUrl: "old",
      offset: 4,
      fileSize: 20,
    };
    const graph = new FacebookGraph(
      {
        kind: "graph",
        pageId: "page",
        graphApiVersion: "v26.0",
        tokenFile: f.tokenFile,
        executionMode: "live",
      },
      {
        request: async (input) => {
          calls.push(input.url);
          return { status: 200, json: { success: true } };
        },
      }
    );
    graph.setAuthorizationVerifier(() => {});
    const result = await graph.submitReel(
      {
        id: "post",
        artifactHash: f.hash,
        publicationAuthorization: {
          operation: "submit",
          pageId: "page",
          requestId: "fixture",
          artifactHash: f.hash,
        },
      },
      f.video,
      state
    );
    assert.equal(result.phase, "processing");
    assert.equal(calls.filter((url) => /page\/video_reels$/.test(url)).length, 1);
    assert.equal(calls[0], "https://rupload.facebook.com/video-upload/v26.0/video-1");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Preview, bad artifact hash, and lost response never perform or retry a Reel mutation", async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const preview = new FacebookGraph(
      {
        kind: "graph",
        pageId: "page",
        graphApiVersion: "v26.0",
        tokenFile: f.tokenFile,
        executionMode: "preview",
      },
      {
        request: async () => {
          calls++;
          return { status: 200, json: {} };
        },
      }
    );
    await assert.rejects(
      preview.submitReel({ id: "post", artifactHash: f.hash }, f.video),
      /preview/
    );
    assert.equal(calls, 0);
    const live = new FacebookGraph(
      {
        kind: "graph",
        pageId: "page",
        graphApiVersion: "v26.0",
        tokenFile: f.tokenFile,
        executionMode: "live",
      },
      {
        request: async () => {
          calls++;
          throw new Error("lost");
        },
      }
    );
    live.setAuthorizationVerifier(() => {});
    await assert.rejects(
      live.submitReel(
        {
          id: "post",
          artifactHash: f.hash,
          publicationAuthorization: {
            operation: "submit",
            pageId: "page",
            requestId: "fixture",
            artifactHash: f.hash,
          },
        },
        f.video
      ),
      (e: unknown) => e instanceof AdapterError && e.uncertain
    );
    assert.equal(calls, 1);
    await assert.rejects(
      live.submitReel(
        {
          id: "post",
          artifactHash: "wrong",
          publicationAuthorization: {
            operation: "submit",
            pageId: "page",
            requestId: "fixture-2",
            artifactHash: "wrong",
          },
        },
        f.video
      ),
      /hash/
    );
    assert.equal(calls, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("direct live Reel submission fails before file/token/HTTP work without durable verification", async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const graph = new FacebookGraph(
      {
        kind: "graph",
        pageId: "page",
        graphApiVersion: "v26.0",
        tokenFile: f.tokenFile,
        executionMode: "live",
      },
      {
        request: async () => {
          calls++;
          return { status: 200, json: {} };
        },
      }
    );
    await assert.rejects(
      graph.submitReel(
        {
          id: "post",
          artifactHash: f.hash,
          publicationAuthorization: {
            operation: "submit",
            pageId: "page",
            requestId: "fixture",
            artifactHash: f.hash,
          },
        },
        f.video
      ),
      /verifier/
    );
    assert.equal(calls, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

async function streamBytes(value: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of value as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
