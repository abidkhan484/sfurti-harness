import { AdapterError } from "../adapters/process.ts";
import type { TextLocator } from "./contracts.ts";

/**
 * Normalized extraction is deliberately a data-only boundary.  It does not
 * execute scripts, follow links, render HTML, or interpret source text as an
 * instruction.  Callers must still quote this untrusted text to agents.
 */
export type ExtractionCoverage = "complete" | "partial" | "failed";
export type FeedEntry = {
  title: string;
  url: string | null;
  summary: string;
  publishedAt: string | null;
  language: string;
  /** A feed summary is never represented as the entry's full article text. */
  needsFetch: true;
};
export type ExtractionMetadata = {
  parser: string;
  parserVersion: string;
  contentType: string;
  title: string;
  authorNames: string[];
  publishedAt: string | null;
  sourceUrl: string;
  byteLength: number;
  truncated: boolean;
  reason?: string;
  feedEntries?: FeedEntry[];
};
export type ExtractionResult = {
  text: string;
  language: string;
  locators: TextLocator[];
  coverage: ExtractionCoverage;
  metadata: ExtractionMetadata;
};
export type ExtractRequest = {
  bytes: Uint8Array;
  mime: string;
  url: string;
  signal?: AbortSignal;
};
export type ExtractorConfig = { maxCharacters?: number };

const PARSER_VERSION = "sfurti-deterministic-extractor/1";
const HTML_MIMES = new Set(["text/html", "application/xhtml+xml"]);
const FEED_MIMES = new Set([
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
]);

/**
 * A bounded offline extractor for snapshots accepted by HttpCollector.
 *
 * This is intentionally conservative for PDF: it extracts literal/UTF-16
 * text from uncompressed content streams and marks any unsupported or scanned
 * document partial instead of claiming OCR/full-text access.
 */
export class DeterministicExtractor {
  private readonly maxCharacters: number;

  constructor(config: ExtractorConfig = {}) {
    this.maxCharacters = config.maxCharacters ?? 1_000_000;
    if (!Number.isSafeInteger(this.maxCharacters) || this.maxCharacters < 1)
      throw new AdapterError("configuration", "Extraction requires a positive character cap");
  }

  extract(request: ExtractRequest): ExtractionResult {
    if (!(request.bytes instanceof Uint8Array))
      throw new AdapterError("configuration", "Extraction requires binary bytes");
    if (!request.url || !isHttpUrl(request.url))
      throw new AdapterError("configuration", "Extraction requires an absolute HTTP URL");
    if (request.signal?.aborted) throw new AdapterError("timeout", "Extraction was aborted");
    const mime = normalizedMime(request.mime);
    const base = {
      parserVersion: PARSER_VERSION,
      contentType: mime,
      sourceUrl: request.url,
      byteLength: request.bytes.byteLength,
    };
    if (HTML_MIMES.has(mime)) return this.html(decodeUtf8(request.bytes), base);
    if (mime === "text/plain") return this.plainText(decodeUtf8(request.bytes), base);
    if (mime === "application/pdf") return this.pdf(request.bytes, base);
    if (FEED_MIMES.has(mime)) return this.feed(decodeUtf8(request.bytes), base);
    return failed(base, "unsupported_mime");
  }

  private html(source: string, base: BaseMetadata): ExtractionResult {
    const title = firstText(source, /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
    const authorNames = metaValues(source, "author");
    const publishedAt = firstMeta(source, ["article:published_time", "date", "dc.date"]);
    const body = articleBody(source);
    const blocks = htmlBlocks(body);
    return completeFromBlocks(
      blocks,
      {
        ...base,
        parser: "html-tokenizer",
        title,
        authorNames,
        publishedAt,
      },
      this.maxCharacters
    );
  }

  private plainText(source: string, base: BaseMetadata): ExtractionResult {
    return completeFromBlocks(
      source.split(/\r?\n(?:\s*\r?\n)+/),
      {
        ...base,
        parser: "plain-text",
        title: "",
        authorNames: [],
        publishedAt: null,
      },
      this.maxCharacters
    );
  }

  private feed(source: string, base: BaseMetadata): ExtractionResult {
    const entries = xmlEntries(source).slice(0, 100);
    const blocks = entries.map((entry) => [entry.title, entry.summary].filter(Boolean).join("\n"));
    const result = completeFromBlocks(
      blocks,
      {
        ...base,
        parser: "rss-atom-tokenizer",
        title: firstText(source, /<(?:channel>\s*)?<title\b[^>]*>([\s\S]*?)<\/title\s*>/i),
        authorNames: [],
        publishedAt: null,
        feedEntries: entries,
      },
      this.maxCharacters
    );
    // Feed-provided summaries have provenance, but must not be presented as
    // full article text. Individual linked articles need their own fetch.
    return {
      ...result,
      coverage: "partial",
      metadata: { ...result.metadata, reason: "feed_entries_require_fetch" },
    };
  }

  private pdf(bytes: Uint8Array, base: BaseMetadata): ExtractionResult {
    const source = Buffer.from(bytes).toString("latin1");
    const pageStreams = pdfPageStreams(source);
    if (!pageStreams.length)
      return {
        text: "",
        language: "und",
        locators: [],
        coverage: "partial",
        metadata: {
          ...base,
          parser: "pdf-text-stream",
          title: "",
          authorNames: [],
          publishedAt: null,
          truncated: false,
          reason: "pdf_text_unavailable",
        },
      };
    const blocks = pageStreams.map(({ page, stream }) => ({ page, text: pdfText(stream) }));
    const unreadable = blocks.some((block) => !block.text);
    const result = completeFromBlocks(
      blocks,
      {
        ...base,
        parser: "pdf-text-stream",
        title: pdfInfo(source, "Title"),
        authorNames: [pdfInfo(source, "Author")].filter(Boolean),
        publishedAt: null,
      },
      this.maxCharacters
    );
    if (!result.text || unreadable)
      return {
        ...result,
        coverage: "partial",
        metadata: { ...result.metadata, reason: "pdf_text_partial_or_unavailable" },
      };
    return result;
  }
}

type BaseMetadata = Pick<
  ExtractionMetadata,
  "parserVersion" | "contentType" | "sourceUrl" | "byteLength"
>;
type Block = string | { text: string; page: number };

function completeFromBlocks(
  blocks: Block[],
  metadata: Omit<ExtractionMetadata, "truncated">,
  maxCharacters: number
): ExtractionResult {
  const normalized: { text: string; page?: number }[] = [];
  for (const block of blocks) {
    const value = typeof block === "string" ? block : block.text;
    const text = redactAudienceIdentifiers(normalizeText(value));
    if (text) normalized.push(typeof block === "string" ? { text } : { text, page: block.page });
  }
  let text = "";
  const locators: TextLocator[] = [];
  let truncated = false;
  for (const block of normalized) {
    if (text.length >= maxCharacters) {
      truncated = true;
      break;
    }
    const prefix = text ? "\n\n" : "";
    const remaining = maxCharacters - text.length - prefix.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const portion = block.text.slice(0, remaining);
    const start = text.length + prefix.length;
    text += prefix + portion;
    if (portion)
      locators.push({
        start,
        end: start + portion.length,
        ...(block.page ? { page: block.page } : {}),
      });
    if (portion.length < block.text.length) truncated = true;
  }
  return {
    text,
    language: detectLanguage(text),
    locators,
    coverage: truncated ? "partial" : "complete",
    metadata: {
      ...metadata,
      truncated,
      title: redactAudienceIdentifiers(normalizeText(metadata.title)),
    },
  };
}

function failed(
  base: BaseMetadata & Partial<ExtractionMetadata>,
  reason: string
): ExtractionResult {
  return {
    text: "",
    language: "und",
    locators: [],
    coverage: "failed",
    metadata: {
      parser: base.parser ?? "none",
      parserVersion: base.parserVersion,
      contentType: base.contentType,
      title: base.title ?? "",
      authorNames: base.authorNames ?? [],
      publishedAt: base.publishedAt ?? null,
      sourceUrl: base.sourceUrl,
      byteLength: base.byteLength,
      truncated: false,
      reason,
    },
  };
}

function normalizedMime(mime: string): string {
  return mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
}
function normalizeText(value: string): string {
  return decodeEntities(value)
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function redactAudienceIdentifiers(value: string): string {
  return (
    value
      // Deliberately include non-Latin local parts/domains: intake accepts every
      // language and an identifier must not survive merely because it is Bangla.
      .replace(/(?<!\S)[^\s@]+@[^\s@]+/gu, "[redacted-email]")
      .replace(/(^|[\s(])@[a-z0-9_]{2,32}\b/gi, "$1[redacted-handle]")
      .replace(/\b(?:\+?880|0)1[3-9]\d{8}\b/g, "[redacted-phone]")
  );
}
function detectLanguage(text: string): string {
  if (!text) return "und";
  if (/[\u0980-\u09ff]/u.test(text)) return "bn";
  if (/[\u0400-\u04ff]/u.test(text)) return "ru";
  if (/[\u0600-\u06ff]/u.test(text)) return "ar";
  const words = text.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? [];
  const joined = ` ${words.join(" ")} `;
  if (/\b(el|la|los|las|una|para|niños|años)\b/.test(joined)) return "es";
  if (/\b(le|la|les|des|pour|avec|enfants)\b/.test(joined)) return "fr";
  if (words.length) return "en";
  return "und";
}
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_all, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x"))
      return String.fromCodePoint(Number.parseInt(lower.slice(2), 16)) || "";
    if (lower.startsWith("#"))
      return String.fromCodePoint(Number.parseInt(lower.slice(1), 10)) || "";
    return named[lower] ?? "";
  });
}
function firstText(source: string, expression: RegExp): string {
  const match = expression.exec(source);
  return match ? htmlToText(match[1]) : "";
}
function firstMeta(source: string, names: string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(
      `<meta\\b(?=[^>]*(?:name|property)=["']${escapeRegExp(name)}["'])[^>]*\\bcontent=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const match = pattern.exec(source);
    if (match) return normalizeText(match[1]);
  }
  return null;
}
function metaValues(source: string, name: string): string[] {
  const value = firstMeta(source, [name]);
  return value
    ? value
        .split(/\s*,\s*/)
        .filter(Boolean)
        .slice(0, 20)
    : [];
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function articleBody(source: string): string {
  const withoutIgnored = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const article = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(withoutIgnored);
  return (article?.[2] ?? withoutIgnored).replace(
    /<(nav|footer|header|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ""
  );
}
function htmlBlocks(source: string): string[] {
  const marked = source.replace(
    /<\/(?:p|div|li|h[1-6]|blockquote|section|article|main|br)\s*>/gi,
    "\n\n"
  );
  return marked
    .replace(/<[^>]*>/g, " ")
    .split(/\n\s*\n/)
    .map(htmlToText)
    .filter(Boolean);
}
function htmlToText(value: string): string {
  return normalizeText(value.replace(/<[^>]*>/g, " "));
}

function xmlEntries(source: string): FeedEntry[] {
  const entryBlocks = [
    ...source.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)\s*>/gi),
  ].map((match) => match[1]);
  return entryBlocks.map((block) => {
    const title = xmlValue(block, "title");
    const summary =
      xmlValue(block, "description") || xmlValue(block, "summary") || xmlValue(block, "content");
    const link =
      /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i.exec(block)?.[1] ??
      xmlValue(block, "link");
    const date =
      xmlValue(block, "pubDate") || xmlValue(block, "published") || xmlValue(block, "updated");
    const publishedAt =
      date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null;
    const normalizedSummary = redactAudienceIdentifiers(htmlToText(summary));
    return {
      title: redactAudienceIdentifiers(htmlToText(title)),
      url: link && isHttpUrl(link) ? link : null,
      summary: normalizedSummary,
      publishedAt,
      language: detectLanguage(`${title}\n${normalizedSummary}`),
      needsFetch: true,
    };
  });
}
function xmlValue(block: string, tag: string): string {
  const found =
    new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}\\s*>`, "i").exec(
      block
    )?.[1] ?? "";
  return found.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1");
}

function pdfPageStreams(source: string): { page: number; stream: string }[] {
  const objects = new Map<string, string>();
  for (const match of source.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g))
    objects.set(match[1], match[2]);
  const pages = [...objects.values()].filter((object) => /\/Type\s*\/Page\b/.test(object));
  const result: { page: number; stream: string }[] = [];
  pages.forEach((pageObject, index) => {
    const ids = [...pageObject.matchAll(/(\d+)\s+\d+\s+R/g)].map((match) => match[1]);
    const streams = ids
      .map((id) => objects.get(id) ?? "")
      .filter((object) => /\bstream\r?\n/.test(object));
    for (const streamObject of streams) {
      if (/\/Filter\b/.test(streamObject)) continue;
      const stream = /\bstream\r?\n([\s\S]*?)\r?\nendstream/.exec(streamObject)?.[1] ?? "";
      result.push({ page: index + 1, stream });
    }
  });
  return result;
}
function pdfText(stream: string): string {
  const textObjects = [...stream.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)].map((match) => match[1]);
  return textObjects
    .flatMap((object) => [
      ...object.matchAll(/(\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>)\s*(?:Tj|'|")/g),
    ])
    .map((match) => decodePdfToken(match[1]))
    .join(" ");
}
function decodePdfToken(token: string): string {
  if (token.startsWith("<")) {
    const hex = token.slice(1, -1).replace(/\s/g, "");
    const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, "hex");
    if (bytes[0] === 0xfe && bytes[1] === 0xff)
      return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    return new TextDecoder("latin1").decode(bytes);
  }
  return token.slice(1, -1).replace(/\\([nrtbf()\\]|\d{1,3})/g, (_all, escaped: string) => {
    if (/^\d/.test(escaped)) return String.fromCharCode(Number.parseInt(escaped, 8));
    return (
      (
        { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" } as Record<
          string,
          string
        >
      )[escaped] ?? escaped
    );
  });
}
function pdfInfo(source: string, key: string): string {
  const token = new RegExp(
    `/${escapeRegExp(key)}\\s*(\\((?:\\\\.|[^\\)])*\\)|<[0-9a-fA-F\\s]+>)`
  ).exec(source)?.[1];
  return token ? normalizeText(decodePdfToken(token)) : "";
}
