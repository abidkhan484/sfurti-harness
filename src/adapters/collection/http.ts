import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { dirname, join, resolve } from "node:path";
import { AdapterError } from "../process.ts";
import { publicUrlAccess, type HostResolver } from "../../research/url-policy.ts";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ACCEPTED_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "application/pdf",
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
]);

export type StreamHttpResponse = {
  status: number;
  headers?: Record<string, string | undefined>;
  body?: AsyncIterable<Uint8Array>;
};

export interface StreamHttpTransport {
  request(request: {
    method: "GET";
    url: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  }): Promise<StreamHttpResponse>;
}

export type CollectionPolicy = {
  check(
    url: URL
  ): Promise<{ allowed: boolean; reason?: string }> | { allowed: boolean; reason?: string };
};

export type HttpCollectionClock = { now(): Date };
export type HttpCollectorConfig = {
  transport: StreamHttpTransport;
  snapshotDirectory: string;
  maxDocumentBytes: number;
  timeoutMs: number;
  requestsPerHostPerMinute: number;
  redirectLimit?: number;
  resolveHost?: HostResolver;
  policy?: CollectionPolicy;
  robots?: CollectionPolicy;
  clock?: HttpCollectionClock;
};
export type FetchRequest = {
  url: string;
  sourceId: string;
  previousEtag?: string | null;
  previousModified?: string | null;
  signal: AbortSignal;
};
export type FetchResult = {
  status: "ok" | "not_modified" | "blocked" | "authentication_required" | "unavailable";
  finalUrl: string;
  bytes?: number;
  mime?: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: string;
  reason?: string;
  nextRunAt?: string;
  /** Persist with the source checkpoint; a body is never inferred from a snippet. */
  checkpoint: { contentHash?: string; snapshotPath?: string; checkedAt: string };
};

/** Bounded public collector. It never resolves/requests private destinations. */
export class HttpCollector {
  private readonly transport: StreamHttpTransport;
  private readonly snapshotDirectory: string;
  private readonly maxDocumentBytes: number;
  private readonly timeoutMs: number;
  private readonly minimumHostIntervalMs: number;
  private readonly redirectLimit: number;
  private readonly resolveHost: HostResolver;
  private readonly policy?: CollectionPolicy;
  private readonly robots?: CollectionPolicy;
  private readonly clock: HttpCollectionClock;
  private readonly hostNextAllowedAt = new Map<string, number>();

  constructor(config: HttpCollectorConfig) {
    if (!config.transport || typeof config.transport.request !== "function")
      throw new AdapterError("configuration", "HTTP collection requires an injected transport");
    if (
      !config.snapshotDirectory ||
      !Number.isSafeInteger(config.maxDocumentBytes) ||
      config.maxDocumentBytes < 1
    )
      throw new AdapterError(
        "configuration",
        "HTTP collection requires a snapshot directory and positive byte cap"
      );
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1)
      throw new AdapterError("configuration", "HTTP collection timeout must be positive");
    if (
      !Number.isSafeInteger(config.requestsPerHostPerMinute) ||
      config.requestsPerHostPerMinute < 1
    )
      throw new AdapterError("configuration", "HTTP collection host pace must be positive");
    this.transport = config.transport;
    this.snapshotDirectory = resolve(config.snapshotDirectory);
    this.maxDocumentBytes = config.maxDocumentBytes;
    this.timeoutMs = config.timeoutMs;
    this.minimumHostIntervalMs = Math.ceil(60_000 / config.requestsPerHostPerMinute);
    this.redirectLimit = config.redirectLimit ?? 5;
    if (
      !Number.isSafeInteger(this.redirectLimit) ||
      this.redirectLimit < 0 ||
      this.redirectLimit > 10
    )
      throw new AdapterError("configuration", "HTTP collection redirect limit must be 0–10");
    this.resolveHost = config.resolveHost ?? defaultResolveHost;
    this.policy = config.policy;
    this.robots = config.robots;
    this.clock = config.clock ?? { now: () => new Date() };
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    if (!(request.signal instanceof AbortSignal))
      throw new AdapterError("configuration", "HTTP collection requires an abort signal");
    const fetchedAt = this.clock.now().toISOString();
    let currentUrl = request.url;
    for (let redirects = 0; redirects <= this.redirectLimit; redirects++) {
      const access = await publicUrlAccess(currentUrl, this.resolveHost);
      if (!access.allowed) return this.result("blocked", currentUrl, fetchedAt, access.reason);
      const policy = await this.checkPolicy(access.url);
      if (policy) return this.result("blocked", access.url.toString(), fetchedAt, policy);
      const pace = this.pace(access.url.hostname);
      if (pace)
        return this.result("unavailable", access.url.toString(), fetchedAt, "host_pacing", pace);

      let response: StreamHttpResponse;
      try {
        response = await this.request(access.url.toString(), request, fetchedAt);
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        return this.result(
          "unavailable",
          access.url.toString(),
          fetchedAt,
          "transport_unavailable"
        );
      }
      if (!Number.isInteger(response.status))
        return this.result("unavailable", access.url.toString(), fetchedAt, "invalid_http_status");
      const headers = normalizedHeaders(response.headers);
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = headers.location;
        if (!location)
          return this.result(
            "unavailable",
            access.url.toString(),
            fetchedAt,
            "redirect_without_location"
          );
        if (redirects === this.redirectLimit)
          return this.result(
            "blocked",
            access.url.toString(),
            fetchedAt,
            "redirect_limit_exceeded"
          );
        try {
          currentUrl = new URL(location, access.url).toString();
        } catch {
          return this.result(
            "blocked",
            access.url.toString(),
            fetchedAt,
            "invalid_redirect_location"
          );
        }
        continue;
      }
      if (response.status === 304)
        return {
          status: "not_modified",
          finalUrl: access.url.toString(),
          fetchedAt,
          etag: headers.etag,
          lastModified: headers["last-modified"],
          checkpoint: { checkedAt: fetchedAt },
        };
      if (response.status === 401 || response.status === 403)
        return this.result(
          "authentication_required",
          access.url.toString(),
          fetchedAt,
          "authentication_required"
        );
      if (response.status === 429) {
        const nextRunAt = retryAt(headers["retry-after"], this.clock.now());
        return this.result(
          "unavailable",
          access.url.toString(),
          fetchedAt,
          "rate_limited",
          nextRunAt
        );
      }
      if (response.status < 200 || response.status >= 300)
        return this.result(
          "unavailable",
          access.url.toString(),
          fetchedAt,
          `http_${response.status}`
        );
      const mime = contentType(headers["content-type"]);
      if (!ACCEPTED_MIME_TYPES.has(mime))
        return this.result("blocked", access.url.toString(), fetchedAt, "unsupported_mime");
      const contentLength = Number(headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > this.maxDocumentBytes)
        return this.result("blocked", access.url.toString(), fetchedAt, "document_too_large");
      if (!response.body)
        return this.result(
          "unavailable",
          access.url.toString(),
          fetchedAt,
          "missing_response_body"
        );
      return this.saveBody(response.body, access.url.toString(), mime, headers, fetchedAt);
    }
    return this.result("blocked", currentUrl, fetchedAt, "redirect_limit_exceeded");
  }

  private async request(
    url: string,
    request: FetchRequest,
    fetchedAt: string
  ): Promise<StreamHttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    try {
      let response: StreamHttpResponse;
      try {
        response = await this.transport.request({
          method: "GET",
          url,
          headers: {
            accept:
              "text/html,application/xhtml+xml,application/pdf,application/rss+xml,application/atom+xml,application/xml,text/xml",
            ...(request.previousEtag ? { "if-none-match": request.previousEtag } : {}),
            ...(request.previousModified ? { "if-modified-since": request.previousModified } : {}),
          },
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted)
          throw new AdapterError("timeout", `HTTP collection timed out at ${fetchedAt}`);
        throw error;
      }
      if (controller.signal.aborted)
        throw new AdapterError("timeout", `HTTP collection timed out at ${fetchedAt}`);
      return response;
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
    }
  }

  private pace(hostname: string): string | null {
    const now = this.clock.now().getTime();
    const next = this.hostNextAllowedAt.get(hostname) ?? 0;
    if (next > now) return new Date(next).toISOString();
    this.hostNextAllowedAt.set(hostname, now + this.minimumHostIntervalMs);
    return null;
  }

  private async checkPolicy(url: URL): Promise<string | null> {
    for (const [name, policy] of [
      ["collection_policy", this.policy],
      ["robots", this.robots],
    ] as const) {
      if (!policy) continue;
      try {
        const decision = await policy.check(url);
        if (!decision.allowed) return decision.reason?.trim() || `${name}_disallowed`;
      } catch {
        return `${name}_unavailable`;
      }
    }
    return null;
  }

  private async saveBody(
    body: AsyncIterable<Uint8Array>,
    finalUrl: string,
    mime: string,
    headers: Record<string, string>,
    fetchedAt: string
  ): Promise<FetchResult> {
    const temporaryPath = join(this.snapshotDirectory, `.fetch-${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await mkdir(dirname(temporaryPath), { recursive: true });
      handle = await open(temporaryPath, "wx");
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of body) {
        if (!(chunk instanceof Uint8Array)) throw new Error("non_binary_chunk");
        bytes += chunk.byteLength;
        if (bytes > this.maxDocumentBytes) {
          await handle.close();
          handle = undefined;
          await rm(temporaryPath, { force: true });
          return this.result("blocked", finalUrl, fetchedAt, "document_too_large");
        }
        hash.update(chunk);
        await handle.write(chunk);
      }
      await handle.close();
      handle = undefined;
      const contentHash = hash.digest("hex");
      // The destination derives solely from the content hash and vetted MIME,
      // never a URL header or fetched filename.
      const snapshotPath = join(this.snapshotDirectory, `${contentHash}${snapshotExtension(mime)}`);
      await rename(temporaryPath, snapshotPath).catch(async (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          await rm(temporaryPath, { force: true });
        else throw error;
      });
      return {
        status: "ok",
        finalUrl,
        bytes,
        mime,
        etag: headers.etag,
        lastModified: headers["last-modified"],
        fetchedAt,
        checkpoint: { contentHash, snapshotPath, checkedAt: fetchedAt },
      };
    } catch {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      return this.result("unavailable", finalUrl, fetchedAt, "body_stream_failed");
    }
  }

  private result(
    status: FetchResult["status"],
    finalUrl: string,
    fetchedAt: string,
    reason: string,
    nextRunAt?: string
  ): FetchResult {
    return {
      status,
      finalUrl,
      fetchedAt,
      reason,
      ...(nextRunAt ? { nextRunAt } : {}),
      checkpoint: { checkedAt: fetchedAt },
    };
  }
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}
function normalizedHeaders(headers: StreamHttpResponse["headers"]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).flatMap(([key, value]) =>
      typeof value === "string" ? [[key.toLowerCase(), value]] : []
    )
  );
}
function contentType(value: string | undefined): string {
  return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}
function snapshotExtension(mime: string): string {
  if (mime === "application/pdf") return ".pdf";
  if (mime.includes("xml") || mime.includes("rss") || mime.includes("atom")) return ".xml";
  return ".html";
}
function retryAt(value: string | undefined, now: Date): string {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return new Date(now.getTime() + seconds * 1000).toISOString();
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) && parsed > now.getTime()
    ? new Date(parsed).toISOString()
    : new Date(now.getTime() + 60_000).toISOString();
}
