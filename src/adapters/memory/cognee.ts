import { AdapterError, isRecord } from "../process.ts";

const MAX_DATASETS = 4;
const MAX_LIMIT = 50;
const MAX_TEXT_LENGTH = 16_000;
const MAX_METADATA_BYTES = 16_384;
const DATASETS = new Set([
  "sfurti-audience-v1",
  "sfurti-evidence-v1",
  "sfurti-approved-claims-v1",
  "sfurti-editorial-history-v1",
]);

export type MemoryDataset =
  | "sfurti-audience-v1"
  | "sfurti-evidence-v1"
  | "sfurti-approved-claims-v1"
  | "sfurti-editorial-history-v1";

export type MemoryUpsertRequest = {
  dataset: MemoryDataset;
  entityVersionId: string;
  text: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  signal: AbortSignal;
};
export type MemoryStatusRequest = { jobId: string; signal: AbortSignal };
export type MemorySearchRequest = {
  datasets: MemoryDataset[];
  query: string;
  limit: number;
  signal: AbortSignal;
};
export type MemoryRemoveRequest = {
  entityVersionId: string;
  remoteIds: string[];
  idempotencyKey: string;
  signal: AbortSignal;
};
export type MemoryHealthRequest = { signal: AbortSignal };

export type MemoryJobResult = { jobId: string; state: "pending" | "ready" };
export type MemoryStatusResult = {
  state: "pending" | "ready" | "failed";
  remoteIds: string[];
};
export type MemorySearchHit = {
  entityVersionId: string;
  documentVersionId?: string;
  locator?: string;
  score: number;
};
export type MemorySearchResult = { hits: MemorySearchHit[]; partial: boolean };
export type MemoryHealthResult = { version: string; capabilities: string[] };

/** The replaceable retrieval boundary. SQLite remains authoritative for all approvals and tombstones. */
export interface Memory {
  upsert(request: MemoryUpsertRequest): Promise<MemoryJobResult>;
  status(request: MemoryStatusRequest): Promise<MemoryStatusResult>;
  search(request: MemorySearchRequest): Promise<MemorySearchResult>;
  remove(request: MemoryRemoveRequest): Promise<{ state: "pending" | "ready" }>;
  health(request: MemoryHealthRequest): Promise<MemoryHealthResult>;
}

export type CogneeHttpResponse = {
  status: number;
  headers?: Record<string, string | undefined>;
  body: string;
};
export interface CogneeHttpTransport {
  request(request: {
    method: "GET" | "POST" | "DELETE";
    url: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  }): Promise<CogneeHttpResponse>;
}
export type CogneeWireRequest = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
};
export type CogneeOperation<I, O> = {
  request(input: I): CogneeWireRequest;
  response(payload: unknown): O;
};

/**
 * This is deliberately supplied from a reviewed, immutable Cognee release.
 * Cognee's published Docker examples used a floating image when this adapter
 * was authored, so built-in guessed routes or provider fields would be unsafe.
 */
export type CogneeProtocol = {
  release: string;
  apiVersion: string;
  requiredCapabilities: string[];
  health: CogneeOperation<undefined, MemoryHealthResult>;
  upsert: CogneeOperation<Omit<MemoryUpsertRequest, "signal">, MemoryJobResult>;
  status: CogneeOperation<Omit<MemoryStatusRequest, "signal">, MemoryStatusResult>;
  search: CogneeOperation<Omit<MemorySearchRequest, "signal">, MemorySearchResult>;
  remove: CogneeOperation<Omit<MemoryRemoveRequest, "signal">, { state: "pending" | "ready" }>;
};
export type CogneeConfig = {
  baseUrl: string;
  token?: string;
  protocol: CogneeProtocol;
  transport: CogneeHttpTransport;
  timeoutMs?: number;
};

/**
 * A strict HTTP implementation of Memory. The protocol is intentionally an
 * explicit release lock: a health mismatch blocks every mutation and search.
 */
export class CogneeMemory implements Memory {
  private readonly baseUrl: URL;
  private readonly token?: string;
  private readonly protocol: CogneeProtocol;
  private readonly transport: CogneeHttpTransport;
  private readonly timeoutMs: number;

  constructor(config: CogneeConfig) {
    this.baseUrl = configuredBaseUrl(config.baseUrl);
    this.token = checkedToken(config.token);
    this.protocol = checkedProtocol(config.protocol);
    if (!config.transport || typeof config.transport.request !== "function")
      throw new AdapterError("configuration", "Cognee requires an HTTP transport");
    if (
      config.timeoutMs !== undefined &&
      (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0)
    )
      throw new AdapterError("configuration", "Cognee timeout must be a positive integer");
    this.transport = config.transport;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async health(request: MemoryHealthRequest): Promise<MemoryHealthResult> {
    requiredSignal(request.signal, "health");
    const result = await this.call(this.protocol.health, undefined, request.signal);
    validateHealth(result, this.protocol);
    return result;
  }

  async upsert(request: MemoryUpsertRequest): Promise<MemoryJobResult> {
    validateUpsert(request);
    await this.requireCompatible(request.signal);
    return validateJob(
      await this.call(this.protocol.upsert, withoutSignal(request), request.signal)
    );
  }

  async status(request: MemoryStatusRequest): Promise<MemoryStatusResult> {
    requiredId(request.jobId, "jobId");
    requiredSignal(request.signal, "status");
    await this.requireCompatible(request.signal);
    return validateStatus(
      await this.call(this.protocol.status, withoutSignal(request), request.signal)
    );
  }

  async search(request: MemorySearchRequest): Promise<MemorySearchResult> {
    validateSearch(request);
    await this.requireCompatible(request.signal);
    return validateSearchResult(
      await this.call(this.protocol.search, withoutSignal(request), request.signal)
    );
  }

  async remove(request: MemoryRemoveRequest): Promise<{ state: "pending" | "ready" }> {
    requiredId(request.entityVersionId, "entityVersionId");
    requiredId(request.idempotencyKey, "idempotencyKey");
    requiredSignal(request.signal, "remove");
    if (
      !Array.isArray(request.remoteIds) ||
      request.remoteIds.length > MAX_LIMIT ||
      request.remoteIds.some((id) => !validId(id))
    )
      throw new AdapterError(
        "configuration",
        "Cognee remove requires at most 50 non-empty remote IDs"
      );
    await this.requireCompatible(request.signal);
    const result = await this.call(this.protocol.remove, withoutSignal(request), request.signal);
    if (!isRecord(result) || (result.state !== "pending" && result.state !== "ready"))
      throw new AdapterError("protocol", "Cognee remove response omitted a valid state");
    return { state: result.state };
  }

  private async requireCompatible(signal: AbortSignal): Promise<void> {
    const health = await this.health({ signal });
    validateHealth(health, this.protocol);
  }

  private async call<I, O>(
    operation: CogneeOperation<I, O>,
    input: I,
    signal: AbortSignal
  ): Promise<O> {
    const wire = operation.request(input);
    if (!isWireRequest(wire))
      throw new AdapterError("configuration", "Cognee protocol produced an invalid request");
    const url = new URL(wire.path, this.baseUrl);
    if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith(this.baseUrl.pathname))
      throw new AdapterError(
        "configuration",
        "Cognee protocol path escaped its configured base URL"
      );
    const body = wire.body === undefined ? undefined : boundedJson(wire.body, "request");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.transport.request({
        method: wire.method,
        url: url.toString(),
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
      if (!Number.isInteger(response.status))
        throw new AdapterError("protocol", "Cognee returned an invalid HTTP status");
      if (response.status === 401 || response.status === 403)
        throw new AdapterError(
          "authentication",
          "Cognee rejected its configured service credentials"
        );
      if (response.status === 429)
        throw new AdapterError(
          "rate_limit",
          "Cognee rate limited this request",
          false,
          retryAfterMs(response.headers)
        );
      if (response.status < 200 || response.status >= 300)
        throw new AdapterError(
          "unavailable",
          `Cognee returned HTTP ${response.status}`,
          wire.method !== "GET"
        );
      if (
        typeof response.body !== "string" ||
        Buffer.byteLength(response.body) > MAX_METADATA_BYTES
      )
        throw new AdapterError("protocol", "Cognee returned an invalid or oversized JSON response");
      let payload: unknown;
      try {
        payload = JSON.parse(response.body);
      } catch {
        throw new AdapterError("protocol", "Cognee did not return JSON");
      }
      try {
        return operation.response(payload);
      } catch (error) {
        if (error instanceof AdapterError) throw error;
        throw new AdapterError("protocol", "Cognee response did not match its pinned protocol");
      }
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      if (controller.signal.aborted)
        throw new AdapterError(
          "timeout",
          "Cognee request timed out or was cancelled",
          wire.method !== "GET"
        );
      throw new AdapterError("unavailable", "Cognee is unavailable", wire.method !== "GET");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
}

function configuredBaseUrl(value: string): URL {
  try {
    const url = new URL(value.endsWith("/") ? value : `${value}/`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error();
    return url;
  } catch {
    throw new AdapterError("configuration", "Cognee baseUrl must be an HTTP(S) service URL");
  }
}
function checkedToken(token: string | undefined): string | undefined {
  if (token === undefined) return undefined;
  if (typeof token !== "string" || !token.trim() || token.length > 4096)
    throw new AdapterError(
      "configuration",
      "Cognee token must be a bounded non-empty service token"
    );
  return token;
}
function checkedProtocol(value: CogneeProtocol): CogneeProtocol {
  if (
    !value ||
    !validId(value.release) ||
    !validId(value.apiVersion) ||
    !Array.isArray(value.requiredCapabilities) ||
    value.requiredCapabilities.some((capability) => !validId(capability)) ||
    ![value.health, value.upsert, value.status, value.search, value.remove].every(
      (operation) =>
        operation &&
        typeof operation.request === "function" &&
        typeof operation.response === "function"
    )
  )
    throw new AdapterError("configuration", "Cognee requires a reviewed explicit release protocol");
  return value;
}
function requiredSignal(signal: AbortSignal, operation: string): void {
  if (!(signal instanceof AbortSignal))
    throw new AdapterError("configuration", `Cognee ${operation} requires an abort signal`);
  if (signal.aborted) throw new AdapterError("timeout", `Cognee ${operation} was cancelled`);
}
function requiredId(value: string, name: string): void {
  if (!validId(value))
    throw new AdapterError(
      "configuration",
      `Cognee ${name} must be a bounded non-empty identifier`
    );
}
function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}
function boundedJson(value: unknown, name: string): string {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new AdapterError("configuration", `Cognee ${name} must be JSON serializable`);
  }
  if (json === undefined || Buffer.byteLength(json) > MAX_METADATA_BYTES)
    throw new AdapterError("configuration", `Cognee ${name} exceeds its bounded JSON size`);
  return json;
}
function withoutSignal<T extends { signal: AbortSignal }>(value: T): Omit<T, "signal"> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "signal")) as Omit<
    T,
    "signal"
  >;
}
function isWireRequest(value: unknown): value is CogneeWireRequest {
  return (
    isRecord(value) &&
    (value.method === "GET" || value.method === "POST" || value.method === "DELETE") &&
    typeof value.path === "string" &&
    value.path.startsWith("/") &&
    !value.path.startsWith("//")
  );
}
function validateUpsert(request: MemoryUpsertRequest): void {
  if (!DATASETS.has(request.dataset))
    throw new AdapterError("configuration", "Cognee dataset is not approved for Sfurti memory");
  requiredId(request.entityVersionId, "entityVersionId");
  requiredId(request.idempotencyKey, "idempotencyKey");
  requiredSignal(request.signal, "upsert");
  if (
    typeof request.text !== "string" ||
    !request.text.trim() ||
    request.text.length > MAX_TEXT_LENGTH
  )
    throw new AdapterError("configuration", "Cognee upsert text must be 1–16000 characters");
  if (!isRecord(request.metadata))
    throw new AdapterError("configuration", "Cognee upsert metadata must be structured");
  boundedJson(request.metadata, "metadata");
  if (
    request.metadata.entityVersionId !== request.entityVersionId ||
    typeof request.metadata.schemaVersion !== "number" ||
    !validId(request.metadata.contentHash)
  )
    throw new AdapterError(
      "rejected",
      "Cognee upsert requires matching entityVersionId, schemaVersion, and contentHash provenance"
    );
}
function validateSearch(request: MemorySearchRequest): void {
  requiredSignal(request.signal, "search");
  if (
    !Array.isArray(request.datasets) ||
    request.datasets.length < 1 ||
    request.datasets.length > MAX_DATASETS ||
    request.datasets.some((dataset) => !DATASETS.has(dataset))
  )
    throw new AdapterError("configuration", "Cognee search requires one to four approved datasets");
  if (typeof request.query !== "string" || !request.query.trim() || request.query.length > 500)
    throw new AdapterError("configuration", "Cognee search query must be 1–500 characters");
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > MAX_LIMIT)
    throw new AdapterError("configuration", "Cognee search limit must be 1–50");
}
function validateJob(value: unknown): MemoryJobResult {
  if (
    !isRecord(value) ||
    !validId(value.jobId) ||
    (value.state !== "pending" && value.state !== "ready")
  )
    throw new AdapterError("protocol", "Cognee upsert response omitted a valid job state");
  return { jobId: value.jobId, state: value.state };
}
function validateStatus(value: unknown): MemoryStatusResult {
  if (
    !isRecord(value) ||
    !["pending", "ready", "failed"].includes(String(value.state)) ||
    !Array.isArray(value.remoteIds) ||
    value.remoteIds.length > MAX_LIMIT ||
    value.remoteIds.some((id) => !validId(id))
  )
    throw new AdapterError(
      "protocol",
      "Cognee status response omitted lifecycle state or remote IDs"
    );
  return { state: value.state as MemoryStatusResult["state"], remoteIds: value.remoteIds };
}
function validateSearchResult(value: unknown): MemorySearchResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.hits) ||
    value.hits.length > MAX_LIMIT ||
    typeof value.partial !== "boolean"
  )
    throw new AdapterError("protocol", "Cognee search response was invalid");
  const hits = value.hits.flatMap((hit): MemorySearchHit[] => {
    if (
      !isRecord(hit) ||
      !validId(hit.entityVersionId) ||
      typeof hit.score !== "number" ||
      !Number.isFinite(hit.score)
    )
      return [];
    if (hit.documentVersionId !== undefined && !validId(hit.documentVersionId)) return [];
    if (hit.locator !== undefined && !validId(hit.locator)) return [];
    return [
      {
        entityVersionId: hit.entityVersionId,
        ...(typeof hit.documentVersionId === "string"
          ? { documentVersionId: hit.documentVersionId }
          : {}),
        ...(typeof hit.locator === "string" ? { locator: hit.locator } : {}),
        score: hit.score,
      },
    ];
  });
  return { hits, partial: value.partial || hits.length !== value.hits.length };
}
function validateHealth(
  value: unknown,
  protocol: CogneeProtocol
): asserts value is MemoryHealthResult {
  if (
    !isRecord(value) ||
    value.version !== protocol.apiVersion ||
    !Array.isArray(value.capabilities)
  )
    throw new AdapterError(
      "protocol",
      "Cognee version or required capabilities are incompatible with the reviewed release protocol"
    );
  const capabilities = value.capabilities;
  if (
    capabilities.some((capability) => !validId(capability)) ||
    protocol.requiredCapabilities.some((required) => !capabilities.includes(required))
  )
    throw new AdapterError(
      "protocol",
      "Cognee version or required capabilities are incompatible with the reviewed release protocol"
    );
}
function retryAfterMs(headers: CogneeHttpResponse["headers"]): number | undefined {
  const value = headers?.["retry-after"] ?? headers?.["Retry-After"];
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}
