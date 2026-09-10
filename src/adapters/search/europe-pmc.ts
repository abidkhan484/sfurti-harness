import { AdapterError, isRecord } from "../process.ts";
import type { HttpResponse, HttpTransport, SearchRequest } from "./searxng.ts";

const MAX_LIMIT = 50;
const MAX_TEXT_LENGTH = 500;
const MAX_CURSOR_LENGTH = 2_000;

export type ScholarlyAccessLink = {
  url: string;
  /** Europe PMC's availability value, when it supplied one. */
  availability: string | null;
  /** A returned link is fetchable metadata, not proof that its text is usable evidence. */
  kind: "full_text" | "publisher";
};

export type EuropePmcHit = {
  /** Stable Europe PMC article page, not an assertion that full text is available. */
  url: string;
  title: string;
  /** Abstract text is discovery metadata only and is never a full-paper assertion. */
  snippet: string;
  publishedAt: string | null;
  providerId: string;
  doi: string | null;
  source: string;
  sourceId: string;
  authorNames: string[];
  authorString: string | null;
  /** `abstract` remains distinct even when a provider record includes an abstract. */
  access: "abstract" | "open_access" | "link_available";
  accessLinks: ScholarlyAccessLink[];
};

export type EuropePmcSearchResult = {
  hits: EuropePmcHit[];
  nextCursor: string | null;
  coverage: { partial: boolean; reason?: string };
};

export type EuropePmcConfig = {
  /** Normally https://www.ebi.ac.uk/europepmc/webservices/rest */
  baseUrl: string;
  transport: HttpTransport;
  timeoutMs?: number;
};

/**
 * Europe PMC metadata search. It intentionally returns discovery metadata and
 * concrete links only; a collector/extractor must establish usable full text.
 */
export class EuropePmcSearch {
  readonly baseUrl: URL;
  readonly transport: HttpTransport;
  readonly timeoutMs: number;

  constructor(config: EuropePmcConfig) {
    this.baseUrl = configuredBaseUrl(config.baseUrl);
    if (!config.transport || typeof config.transport.request !== "function")
      throw new AdapterError("configuration", "Europe PMC requires an HTTP transport");
    if (
      config.timeoutMs !== undefined &&
      (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0)
    )
      throw new AdapterError("configuration", "Europe PMC timeout must be a positive integer");
    this.transport = config.transport;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async search(request: SearchRequest): Promise<EuropePmcSearchResult> {
    const query = boundedText(request.query, "query");
    const limit = boundedLimit(request.limit);
    const cursor = parseCursor(request.cursor);
    if (!(request.signal instanceof AbortSignal))
      throw new AdapterError("configuration", "Europe PMC search requires an abort signal");
    if (request.signal.aborted)
      throw new AdapterError("timeout", "Europe PMC search was cancelled");

    const url = new URL("search", this.baseUrl);
    url.searchParams.set("query", query);
    url.searchParams.set("format", "json");
    // `core` is required for the documented abstract and fullTextUrlList fields.
    url.searchParams.set("resultType", "core");
    url.searchParams.set("pageSize", String(limit));
    url.searchParams.set("cursorMark", cursor);

    const response = await this.request(url, request.signal);
    if (!Number.isInteger(response.status))
      throw new AdapterError("protocol", "Europe PMC returned an invalid HTTP status");
    if (response.status === 429)
      throw new AdapterError(
        "rate_limit",
        "Europe PMC rate limited this search; preserve its cursor and retry later",
        false,
        retryAfterMs(response.headers)
      );
    if (response.status < 200 || response.status >= 300)
      throw new AdapterError("unavailable", "Europe PMC returned an unavailable response");
    if (typeof response.body !== "string")
      throw new AdapterError("protocol", "Europe PMC returned a non-text response");

    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new AdapterError("protocol", "Europe PMC did not return JSON");
    }
    if (
      !isRecord(payload) ||
      !isRecord(payload.resultList) ||
      !Array.isArray(payload.resultList.result)
    )
      throw new AdapterError("protocol", "Europe PMC JSON response omitted resultList.result");

    const malformed = payload.resultList.result.some(
      (result) => !isRecord(result) || !validResult(result)
    );
    const seen = new Set<string>();
    const hits = payload.resultList.result
      .filter(isRecord)
      .filter(validResult)
      .map(mapResult)
      .filter((hit): hit is EuropePmcHit => hit !== null)
      .filter((hit) => {
        const identity = scholarlyIdentity(hit);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .slice(0, limit);
    const returnedCursor =
      typeof payload.nextCursorMark === "string" ? payload.nextCursorMark : null;
    // An unchanged marker is exhausted; retaining it would create an infinite retry loop.
    const nextCursor =
      returnedCursor && returnedCursor !== cursor && hits.length ? returnedCursor : null;
    return {
      hits,
      nextCursor,
      coverage: malformed
        ? { partial: true, reason: "Europe PMC returned malformed results" }
        : { partial: false },
    };
  }

  private async request(url: URL, signal: AbortSignal): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await this.transport.request({
        method: "GET",
        url: url.toString(),
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      if (controller.signal.aborted)
        throw new AdapterError("timeout", "Europe PMC search timed out or was cancelled");
      throw new AdapterError("unavailable", "Europe PMC search is unavailable");
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    }
  }
}

/** DOI identity is shared with web discovery so duplicate reports remain provenance, not studies. */
export function normalizeDoi(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[\s.]+$/g, "")
    .toLowerCase();
  return /^10\.\d{4,9}\/[!-~]+$/.test(normalized) ? normalized : null;
}

export function scholarlyIdentity(hit: Pick<EuropePmcHit, "doi" | "providerId">): string {
  return hit.doi ? `doi:${hit.doi}` : `europe-pmc:${hit.providerId}`;
}

function configuredBaseUrl(value: string): URL {
  try {
    const url = new URL(value.endsWith("/") ? value : `${value}/`);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    if (url.username || url.password || url.search || url.hash) throw new Error();
    return url;
  } catch {
    throw new AdapterError("configuration", "Europe PMC baseUrl must be an HTTP(S) API base URL");
  }
}

function boundedText(value: string, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_TEXT_LENGTH)
    throw new AdapterError(
      "configuration",
      `Europe PMC ${name} must be 1–${MAX_TEXT_LENGTH} characters`
    );
  return value.trim();
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT)
    throw new AdapterError(
      "configuration",
      `Europe PMC limit must be an integer from 1 to ${MAX_LIMIT}`
    );
  return value;
}

function parseCursor(value: string | null | undefined): string {
  if (value === null || value === undefined) return "*";
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_CURSOR_LENGTH ||
    /[^\x21-\x7e]/.test(value)
  )
    throw new AdapterError("protocol", "Europe PMC cursor is invalid");
  return value;
}

function validResult(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.source === "string" &&
    value.source.trim().length > 0 &&
    typeof value.title === "string" &&
    value.title.trim().length > 0
  );
}

function mapResult(value: Record<string, unknown>): EuropePmcHit | null {
  const sourceId = (value.id as string).trim();
  const source = (value.source as string).trim();
  const url = articleUrl(source, sourceId);
  if (!url) return null;
  const accessLinks = mapAccessLinks(value.fullTextUrlList);
  const doi = normalizeDoi(typeof value.doi === "string" ? value.doi : null);
  const isOpenAccess = value.isOpenAccess === "Y" || value.isOpenAccess === true;
  return {
    url,
    title: (value.title as string).trim(),
    snippet: typeof value.abstractText === "string" ? value.abstractText : "",
    publishedAt: parseDate(value.firstPublicationDate) ?? parseDate(value.pubYear),
    providerId: `${source}:${sourceId}`,
    doi,
    source,
    sourceId,
    authorNames: authorNames(value.authorList),
    authorString:
      typeof value.authorString === "string" && value.authorString.trim()
        ? value.authorString
        : null,
    access: isOpenAccess ? "open_access" : accessLinks.length ? "link_available" : "abstract",
    accessLinks,
  };
}

function articleUrl(source: string, sourceId: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(source) || !/^[A-Za-z0-9_.-]+$/.test(sourceId)) return null;
  // The API base may be an EBI host, whereas the record's stable citation page
  // is on Europe PMC itself. This remains discovery metadata, not fetched text.
  const url = new URL(
    `article/${encodeURIComponent(source)}/${encodeURIComponent(sourceId)}`,
    "https://europepmc.org/"
  );
  return url.toString();
}

function mapAccessLinks(value: unknown): ScholarlyAccessLink[] {
  if (!isRecord(value) || !Array.isArray(value.fullTextUrl)) return [];
  const seen = new Set<string>();
  return value.fullTextUrl.flatMap((entry): ScholarlyAccessLink[] => {
    if (!isRecord(entry) || typeof entry.url !== "string") return [];
    const url = safeHttpUrl(entry.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const availability = typeof entry.availability === "string" ? entry.availability : null;
    return [
      {
        url,
        availability,
        kind: /publisher/i.test(String(entry.site ?? "")) ? "publisher" : "full_text",
      },
    ];
  });
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password)
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function authorNames(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.author)) return [];
  return value.author.flatMap((author): string[] => {
    if (!isRecord(author)) return [];
    const name = typeof author.fullName === "string" ? author.fullName.trim() : "";
    return name ? [name] : [];
  });
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function retryAfterMs(headers: HttpResponse["headers"]): number | undefined {
  const value = headers?.["retry-after"] ?? headers?.["Retry-After"];
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1_000) : undefined;
}
