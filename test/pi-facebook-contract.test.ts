import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Facebook contract pins the explicit version and keeps lost mutations unknown", async () => {
  const text = await readFile(
    new URL("../docs/integrations/facebook-api-contract.md", import.meta.url),
    "utf8"
  );
  assert.match(text, /GRAPH_API_VERSION/);
  assert.match(text, /v26\.0/);
  assert.match(text, /must return\s+`unknown`/);
  assert.match(text, /Preview blocks every mutation/);
  assert.doesNotMatch(text, /access_token=[A-Za-z0-9_-]{20,}/);
});

test("Facebook contract records Page and Reels paths without inventing Reel scheduling", async () => {
  const text = await readFile(
    new URL("../docs/integrations/facebook-api-contract.md", import.meta.url),
    "utf8"
  );
  assert.match(text, /\{page_id\}\/feed/);
  assert.match(text, /\{page_id\}\/photos/);
  assert.match(text, /\{page_id\}\/video_reels/);
  assert.match(text, /rupload\.facebook\.com\/video-upload/);
  assert.match(
    text,
    /No supported Reels future-scheduling or cancellation operation is documented/
  );
  assert.match(text, /Graph API Explorer Guide/);
});
