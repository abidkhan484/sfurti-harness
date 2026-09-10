import { AdapterError, isRecord } from "../process.ts";

const MAX_LIMIT = 50;
const TRACKING_PARAMETER = /^(?:utm_[^=]*|fbclid|gclid|dclid|mc_cid|mc_eid)$/i;

export type SearchHit = {
  url: string;
  title: string;
  snippet: string;
  publishedAt: string | null;
  providerId?: string;
};

export type SearchResult = {
  hits: SearchHit[];
  nextCursor: string | null;
  coverage: { partial: boolean; reason?: string };
};

export type SearchRequest = {
  query: string;
  language: string;
  cursor?: string | null;
  limit: number;
  signal: AbortSignal;
};

export type HttpResponse = {
  status: number;
  headers?: Record<string, string | undefined>;
  body: string;
};

export interface HttpTransport {
  request(request: {
    method: "GET";
    url: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  }): Promise<HttpResponse>;
}

export type SearxngConfig = {
  baseUrl: string;
  transport: HttpTransport;
  timeoutMs?: number;
};

/**
 * Operator-controlled SearXNG JSON discovery. Results are only discovery
 * metadata: callers must fetch and assess the original source separately.
 */
export class SearxngSearch {
  readonly baseUrl: URL;
  readonly transport: HttpTransport;
  readonly timeoutMs: number;

  constructor(config: SearxngConfig) {
    this.baseUrl = configuredBaseUrl(config.baseUrl);
    if (!config.transport || typeof config.transport.request !== "function")
      throw new AdapterError("configuration", "SearXNG requires an HTTP transport");
    if (
      config.timeoutMs !== undefined &&
      (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0)
    )
      throw new AdapterError("configuration", "SearXNG timeout must be a positive integer");
    this.transport = config.transport;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async search(request: SearchRequest): Promise<SearchResult> {
    const query = boundedText(request.query, "query");
    const language = boundedText(request.language, "language");
    const limit = boundedLimit(request.limit);
    const page = parseCursor(request.cursor);
    if (!(request.signal instanceof AbortSignal))
      throw new AdapterError("configuration", "SearXNG search requires an abort signal");
    if (request.signal.aborted) throw new AdapterError("timeout", "SearXNG search was cancelled");

    const url = new URL("search", this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("language", language);
    url.searchParams.set("format", "json");
    url.searchParams.set("pageno", String(page));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    let response: HttpResponse;
    try {
      response = await this.transport.request({
        method: "GET",
        url: url.toString(),
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      if (controller.signal.aborted)
        throw new AdapterError("timeout", "SearXNG search timed out or was cancelled");
      throw new AdapterError("unavailable", "SearXNG search is unavailable");
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", onAbort);
    }

    if (!Number.isInteger(response.status))
      throw new AdapterError("protocol", "SearXNG returned an invalid HTTP status");
    if (response.status === 403)
      throw new AdapterError(
        "configuration",
        "SearXNG JSON output is disabled; enable json in search.formats on the configured instance"
      );
    if (response.status === 429)
      throw new AdapterError(
        "rate_limit",
        "SearXNG rate limited this search; preserve its cursor and retry later",
        false,
        retryAfterMs(response.headers)
      );
    if (response.status < 200 || response.status >= 300)
      throw new AdapterError("unavailable", "SearXNG returned an unavailable response");
    if (typeof response.body !== "string")
      throw new AdapterError("protocol", "SearXNG returned a non-text response");

    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new AdapterError("protocol", "SearXNG did not return JSON");
    }
    if (!isRecord(payload) || !Array.isArray(payload.results))
      throw new AdapterError("protocol", "SearXNG JSON response omitted results");

    const malformed = payload.results.some(
      (result) => !validSearxResult(result) || !hasSafeUrl(result)
    );
    const hits = payload.results
      .filter(validSearxResult)
      .map(mapResult)
      .filter((hit): hit is SearchHit => hit !== null)
      .slice(0, limit);
    const unresponsive = unresponsiveEngineCount(payload.unresponsive_engines);
    const partialReasons = [
      unresponsive ? "one or more configured search engines did not respond" : undefined,
      malformed ? "SearXNG returned malformed results" : undefined,
    ].filter((reason): reason is string => Boolean(reason));
    const total = typeof payload.number_of_results === "number" ? payload.number_of_results : null;
    const nextCursor = total !== null && total > page * limit ? String(page + 1) : null;
    return {
      hits,
      nextCursor,
      coverage: {
        partial: partialReasons.length > 0,
        ...(partialReasons.length ? { reason: partialReasons.join("; ") } : {}),
      },
    };
  }
}

/** Canonicalizes discovery URLs for deterministic source deduplication. */
export function normalizeSearchUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    )
      url.port = "";
    url.hash = "";
    const parameters = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMETER.test(key))
      .sort(
        ([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue)
      );
    url.search = "";
    for (const [key, parameter] of parameters) url.searchParams.append(key, parameter);
    return url.toString();
  } catch {
    return null;
  }
}

function configuredBaseUrl(value: string): URL {
  try {
    const url = new URL(value.endsWith("/") ? value : `${value}/`);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    if (url.username || url.password || url.search || url.hash) throw new Error();
    return url;
  } catch {
    throw new AdapterError("configuration", "SearXNG baseUrl must be an HTTP(S) instance URL");
  }
}

function boundedText(value: string, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500)
    throw new AdapterError("configuration", `SearXNG ${name} must be 1–500 characters`);
  return value.trim();
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT)
    throw new AdapterError(
      "configuration",
      `SearXNG limit must be an integer from 1 to ${MAX_LIMIT}`
    );
  return value;
}

function parseCursor(cursor: string | null | undefined): number {
  if (cursor === null || cursor === undefined) return 1;
  if (!/^[1-9]\d*$/.test(cursor) || Number(cursor) > 10_000)
    throw new AdapterError("protocol", "SearXNG cursor is invalid");
  return Number(cursor);
}

function validSearxResult(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    typeof value.content === "string"
  );
}

function hasSafeUrl(value: Record<string, unknown>): boolean {
  return normalizeSearchUrl(value.url as string) !== null;
}

function mapResult(value: Record<string, unknown>): SearchHit | null {
  const url = normalizeSearchUrl(value.url as string);
  if (!url) return null;
  const publishedAt = parsePublishedAt(value.publishedDate);
  return {
    url,
    title: value.title as string,
    snippet: value.content as string,
    publishedAt,
    ...(typeof value.engine === "string" && value.engine.trim()
      ? { providerId: value.engine }
      : {}),
  };
}

function parsePublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function unresponsiveEngineCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return isRecord(value) ? Object.keys(value).length : 0;
}

function retryAfterMs(headers: HttpResponse["headers"]): number | undefined {
  const value = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}
