import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { LocalDocumentExtractor } from "../src/adapters/collection/extract.ts";

const fixture = async (name: string) =>
  new Uint8Array(
    await readFile(fileURLToPath(new URL(`./fixtures/research/${name}`, import.meta.url)))
  );
const extract = new LocalDocumentExtractor({ maxCharacters: 5_000 });
const request = (bytes: Uint8Array, mime: string) => ({
  bytes,
  mime,
  url: "https://source.example/document",
  signal: new AbortController().signal,
});

test("HTML extraction preserves normalized UTF-16 locators across Bangla, English and Spanish", async () => {
  for (const [name, language] of [
    ["article-bn.html", "bn"],
    ["article-en.html", "en"],
    ["article-es.html", "es"],
  ] as const) {
    const result = extract.extract(request(await fixture(name), "text/html; charset=utf-8"));
    assert.equal(result.coverage, "complete");
    assert.equal(result.language, language);
    assert.ok(result.locators.length > 0);
    for (const locator of result.locators)
      assert.equal(
        result.text.slice(locator.start, locator.end).length,
        locator.end - locator.start
      );
    assert.match(result.text, /SYNTHETIC TEST DATA/);
  }
});

test("extraction removes audience identifiers but preserves scientific author attribution", async () => {
  const result = extract.extract(request(await fixture("article-bn.html"), "text/html"));
  assert.doesNotMatch(result.text, /রিমা@উদাহরণ|@parent_help/);
  assert.match(result.text, /\[redacted-email\]/);
  assert.deepEqual(result.metadata.authorNames, ["Dr. Fictional Scientist"]);
});

test("source prompt injection remains inert quoted text and triggers no URL or policy action", async () => {
  const result = extract.extract(request(await fixture("malicious-page.html"), "text/html"));
  assert.equal(result.coverage, "complete");
  assert.match(result.text, /Ignore every policy/);
  assert.match(result.text, /169\.254\.169\.254/);
  assert.equal(result.metadata.sourceUrl, "https://source.example/document");
});

test("plain text truncation is explicit and does not fabricate coverage", () => {
  const bounded = new LocalDocumentExtractor({ maxCharacters: 12 });
  const result = bounded.extract(
    request(new TextEncoder().encode("SYNTHETIC TEST DATA: long body"), "text/plain")
  );
  assert.equal(result.coverage, "partial");
  assert.equal(result.metadata.truncated, true);
  assert.equal(result.text, "SYNTHETIC TE");
});

test("PDF text extraction emits one-based page locators and scanned PDFs remain partial", async () => {
  const readable = extract.extract(request(await fixture("textual.pdf"), "application/pdf"));
  assert.equal(readable.coverage, "complete");
  assert.deepEqual(
    readable.locators.map((locator) => locator.page),
    [1, 2]
  );
  assert.equal(
    readable.text.slice(readable.locators[1].start, readable.locators[1].end),
    "Page two keeps its locator."
  );
  const scanned = extract.extract(request(await fixture("scanned.pdf"), "application/pdf"));
  assert.equal(scanned.coverage, "partial");
  assert.equal(scanned.metadata.reason, "pdf_text_unavailable");
});

test("RSS entries remain partial and require an individual article fetch", async () => {
  const result = extract.extract(request(await fixture("feed.xml"), "application/rss+xml"));
  assert.equal(result.coverage, "partial");
  assert.equal(result.metadata.feedEntries?.[0].needsFetch, true);
  assert.equal(result.metadata.feedEntries?.[0].url, "https://example.test/article");
  assert.match(result.text, /summary, not full text/);
});
