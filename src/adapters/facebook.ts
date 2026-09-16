import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolveSecretFile } from "../deployment/secrets.ts";
import { AdapterError } from "./process.ts";

export interface FacebookHttp {
  request(input: {
    method: "GET" | "POST" | "DELETE";
    url: string;
    headers: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
  }): Promise<{ status: number; json: unknown }>;
}

export interface FacebookConfig {
  kind: "graph";
  pageId: string;
  graphApiVersion: string;
  tokenFile: string;
  executionMode: "preview" | "live";
  requestTimeoutMs?: number;
}

export type ReelPhase =
  "starting" | "uploading" | "uploaded" | "processing" | "published" | "failed" | "unknown";
export interface ReelState {
  id: string;
  pageId: string;
  artifactHash: string;
  phase: ReelPhase;
  videoId?: string;
  uploadUrl?: string;
  offset: number;
  fileSize: number;
  lastConfirmedState?: string;
  reason?: string;
}

type Journal = { put(collection: string, value: { id: string; [key: string]: unknown }): unknown };
export type PublicationAuthorization = {
  operation: "submit" | "cancel";
  requestId: string;
  pageId: string;
  postId?: string;
  artifactId?: string;
  artifactVersion?: string | number;
  artifactHash: string;
  configFingerprint?: string;
};
export type PublicationAuthorizationVerifier = (authorization: PublicationAuthorization) => void;

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
async function hashFile(filePath: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

/** Built-in Graph transport. It has no default fetch implementation, so wiring it
 * cannot cause network traffic until the operator deliberately supplies one. */
export class FacebookGraph {
  readonly config: FacebookConfig;
  private readonly http: FacebookHttp;
  private journal?: Journal;
  private authorizationVerifier?: PublicationAuthorizationVerifier;
  constructor(config: FacebookConfig, http: FacebookHttp, journal?: Journal) {
    this.config = config;
    this.http = http;
    this.journal = journal;
    if (!nonempty(config.pageId) || !/^v\d+\.\d+$/.test(config.graphApiVersion))
      throw new AdapterError(
        "configuration",
        "Facebook requires Page ID and explicit Graph API version"
      );
    if (!nonempty(config.tokenFile))
      throw new AdapterError("configuration", "Facebook requires tokenFile");
  }
  /** Installed by the harness after its durable Store is available.  Keeping
   * this explicit makes direct adapter use fail closed rather than allowing a
   * caller to fabricate an authorization-shaped object. */
  setAuthorizationVerifier(verifier: PublicationAuthorizationVerifier) {
    this.authorizationVerifier = verifier;
  }
  setJournal(journal: Journal) {
    this.journal = journal;
  }
  private url(path: string) {
    return `https://graph.facebook.com/${this.config.graphApiVersion}/${path}`;
  }
  private uploadUrl(videoId: string) {
    return `https://rupload.facebook.com/video-upload/${this.config.graphApiVersion}/${videoId}`;
  }
  private token() {
    return resolveSecretFile({ tokenFile: this.config.tokenFile }, "Facebook");
  }
  private async call(method: "GET" | "POST", path: string, body?: unknown, signal?: AbortSignal) {
    return this.callUrl(method, this.url(path), body, signal);
  }
  private async callUrl(
    method: "GET" | "POST" | "DELETE",
    url: string,
    body?: unknown,
    signal?: AbortSignal,
    headers: Record<string, string> = {}
  ) {
    const token = this.token();
    try {
      const result = await this.http.request({
        method,
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body,
        signal,
      });
      if (result.status < 200 || result.status >= 300)
        throw new AdapterError("rejected", `Facebook request failed with HTTP ${result.status}`);
      return result.json;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError("transient", "Facebook request outcome is unknown", true);
    }
  }
  private authorize(post: Record<string, unknown>, operation: "submit" | "cancel") {
    const authorization = record(post.publicationAuthorization)
      ? (post.publicationAuthorization as PublicationAuthorization)
      : undefined;
    if (
      !authorization ||
      authorization.operation !== operation ||
      authorization.pageId !== this.config.pageId ||
      !nonempty(authorization.requestId) ||
      !nonempty(authorization.artifactHash)
    )
      throw new AdapterError(
        "rejected",
        "Facebook mutation requires a bound publication authorization"
      );
    if (!this.authorizationVerifier)
      throw new AdapterError(
        "rejected",
        "Facebook mutation authorization verifier is not installed"
      );
    this.authorizationVerifier(authorization);
    return authorization;
  }
  async bounds() {
    return { minLeadMinutes: 10, maxLeadDays: 30, remoteScheduling: true };
  }
  /** Explicit read-only probe of the documented Page published posts or feed endpoint. */
  async probe(signal?: AbortSignal) {
    try {
      await this.call("GET", `${this.config.pageId}/published_posts?limit=1`, undefined, signal);
    } catch {
      await this.call("GET", `${this.config.pageId}/feed?limit=1`, undefined, signal);
    }
    return { pageId: this.config.pageId, outcome: "passed" as const };
  }
  private intent(operation: string, post: Record<string, unknown>) {
    const contentHash = createHash("sha256").update(JSON.stringify(post)).digest("hex");
    const id = `facebook:${operation}:${String(post.id ?? contentHash)}`;
    const authorization = record(post.publicationAuthorization)
      ? (post.publicationAuthorization as PublicationAuthorization)
      : undefined;
    this.journal?.put("operation_journals", {
      id,
      operationId: id,
      operation,
      destinationIdentity: this.config.pageId,
      explicitApiVersion: this.config.graphApiVersion,
      selectedArtifactHash: authorization?.artifactHash ?? contentHash,
      artifactId: authorization?.artifactId,
      artifactVersion: authorization?.artifactVersion,
      requestFingerprint: authorization?.requestId ?? contentHash,
      attempt: 1,
      remoteIds: [],
      lastConfirmedState: "intended",
      uncertainty: false,
      status: "intended",
      createdAt: new Date().toISOString(),
    });
    return { id, contentHash };
  }
  private reelState(state: ReelState) {
    this.journal?.put("operation_journals", {
      ...state,
      id: `${state.id}:state`,
      operationId: state.id,
      operation: "reel",
      explicitApiVersion: this.config.graphApiVersion,
      status: state.phase,
      updatedAt: new Date().toISOString(),
    });
    return state;
  }
  private unknown(state: ReelState, reason: string) {
    return this.reelState({ ...state, phase: "unknown", reason });
  }
  /** Reels have no documented remote scheduling or cancellation contract. Local planning owns due time. */
  async reelBounds() {
    return { remoteScheduling: false, localDueTimeDispatch: true, cancellation: false };
  }
  /**
   * Starts or resumes one known Reel. Each confirmed phase overwrites the same
   * durable operation record; an ambiguous request is held as unknown and is
   * never restarted automatically.
   */
  async submitReel(
    post: unknown,
    filePath: string,
    prior?: ReelState,
    signal?: AbortSignal
  ): Promise<ReelState> {
    if (this.config.executionMode !== "live")
      throw new AdapterError("rejected", "Facebook mutation is blocked in preview mode");
    if (!record(post) || !nonempty(post.id) || !nonempty(filePath))
      throw new AdapterError("rejected", "Facebook Reel requires post identity and artifact file");
    this.authorize(post, "submit");
    if (nonempty(post.pageId) && post.pageId !== this.config.pageId)
      throw new AdapterError(
        "rejected",
        "Facebook Reel Page identity does not match configured Page"
      );
    const bytes = await stat(filePath);
    if (!bytes.isFile() || bytes.size <= 0)
      throw new AdapterError("rejected", "Facebook Reel artifact is not a non-empty file");
    const artifactHash = await hashFile(filePath);
    if (nonempty(post.artifactHash) && post.artifactHash !== artifactHash)
      throw new AdapterError(
        "rejected",
        "Facebook Reel artifact hash no longer matches approved artifact"
      );
    let state =
      prior ??
      (() => {
        const intent = this.intent("reel", post);
        return this.reelState({
          id: intent.id,
          pageId: this.config.pageId,
          artifactHash,
          phase: "starting",
          offset: 0,
          fileSize: bytes.size,
        });
      })();
    if (
      state.pageId !== this.config.pageId ||
      state.artifactHash !== artifactHash ||
      state.fileSize !== bytes.size
    )
      throw new AdapterError(
        "rejected",
        "Facebook Reel resume state does not match current Page or artifact"
      );
    if (state.phase === "unknown" || state.phase === "failed" || state.phase === "published")
      return state;
    try {
      if (state.phase === "starting") {
        const result = await this.call(
          "POST",
          `${this.config.pageId}/video_reels`,
          { upload_phase: "start" },
          signal
        );
        if (!record(result) || !nonempty(result.video_id) || !nonempty(result.upload_url))
          throw new AdapterError(
            "protocol",
            "Facebook Reel start omitted video ID or upload URL",
            true
          );
        state = this.reelState({
          ...state,
          phase: "uploading",
          videoId: result.video_id,
          uploadUrl: result.upload_url,
        });
      }
      if (state.phase === "uploading") {
        if (!state.videoId || !state.uploadUrl)
          throw new AdapterError("protocol", "Facebook Reel upload session is incomplete", true);
        const result = await this.callUrl(
          "POST",
          this.uploadUrl(state.videoId),
          createReadStream(filePath, { start: state.offset }),
          signal,
          {
            "Content-Type": "application/octet-stream",
            offset: String(state.offset),
            file_size: String(state.fileSize),
          }
        );
        if (!record(result) || result.success !== true)
          throw new AdapterError("rejected", "Facebook Reel upload was not acknowledged", true);
        state = this.reelState({
          ...state,
          phase: "uploaded",
          offset: state.fileSize,
          lastConfirmedState: "upload-acknowledged",
        });
      }
      if (state.phase === "uploaded") {
        const result = await this.call("GET", `${state.videoId}?fields=status`, undefined, signal);
        const status =
          record(result) && record(result.status) ? String(result.status.video_status ?? "") : "";
        if (status === "error")
          return this.reelState({
            ...state,
            phase: "failed",
            lastConfirmedState: status,
            reason: "Facebook processing failed",
          });
        const finish = await this.call(
          "POST",
          `${this.config.pageId}/video_reels`,
          {
            video_id: state.videoId,
            upload_phase: "finish",
            video_state: "PUBLISHED",
            ...(typeof post.caption === "string" ? { description: post.caption } : {}),
            ...(typeof post.title === "string" ? { title: post.title } : {}),
          },
          signal
        );
        if (!record(finish) || finish.success !== true)
          throw new AdapterError("rejected", "Facebook Reel finish was not acknowledged", true);
        state = this.reelState({
          ...state,
          phase: "processing",
          lastConfirmedState: status || "finish-acknowledged",
        });
      }
      if (state.phase === "processing") {
        const result = await this.call("GET", `${state.videoId}?fields=status`, undefined, signal);
        const status =
          record(result) && record(result.status) ? String(result.status.video_status ?? "") : "";
        if (status === "published")
          return this.reelState({ ...state, phase: "published", lastConfirmedState: status });
        if (status === "error")
          return this.reelState({
            ...state,
            phase: "failed",
            lastConfirmedState: status,
            reason: "Facebook processing failed",
          });
        return this.reelState({
          ...state,
          phase: "processing",
          lastConfirmedState: status || "processing",
        });
      }
      return state;
    } catch (error) {
      if (error instanceof AdapterError && !error.uncertain) throw error;
      this.unknown(state, "Facebook Reel request outcome is unknown; reconcile before retrying");
      if (error instanceof AdapterError) throw error;
      throw new AdapterError("transient", "Facebook Reel request outcome is unknown", true);
    }
  }
  async submit(post: unknown, signal?: AbortSignal) {
    if (this.config.executionMode !== "live")
      throw new AdapterError("rejected", "Facebook mutation is blocked in preview mode");
    if (!record(post) || !nonempty(post.id))
      throw new AdapterError("rejected", "Facebook post identity is required");
    this.authorize(post, "submit");
    const { id } = this.intent("submit", post);
    const message =
      typeof post.message === "string"
        ? post.message
        : typeof post.caption === "string"
          ? post.caption
          : "";
    const scheduled =
      typeof post.scheduledAt === "string"
        ? Math.floor(Date.parse(post.scheduledAt) / 1000)
        : undefined;
    const body = scheduled
      ? { message, published: false, scheduled_publish_time: scheduled }
      : { message, published: true };
    const result = await this.call("POST", `${this.config.pageId}/feed`, body, signal);
    if (!record(result) || !nonempty(result.id))
      throw new AdapterError("protocol", "Facebook did not return a Page post ID", true);
    this.journal?.put("operation_journals", {
      id,
      status: "accepted",
      remoteId: result.id,
      confirmedAt: new Date().toISOString(),
    });
    return {
      remoteId: result.id,
      status: scheduled ? ("scheduled" as const) : ("published" as const),
    };
  }
  async submitPhoto(post: unknown, photoUrl: unknown, signal?: AbortSignal) {
    if (this.config.executionMode !== "live")
      throw new AdapterError("rejected", "Facebook mutation is blocked in preview mode");
    if (!record(post) || !nonempty(post.id) || !nonempty(photoUrl) || !/^https:\/\//.test(photoUrl))
      throw new AdapterError("rejected", "Facebook photo requires a fetchable HTTPS URL");
    this.authorize(post, "submit");
    const { id } = this.intent("photo", post);
    const result = await this.call(
      "POST",
      `${this.config.pageId}/photos`,
      { url: photoUrl },
      signal
    );
    if (!record(result) || !nonempty(result.id) || !nonempty(result.post_id))
      throw new AdapterError("protocol", "Facebook did not return photo and Page post IDs", true);
    this.journal?.put("operation_journals", {
      id,
      status: "accepted",
      remoteId: result.post_id,
      photoId: result.id,
      confirmedAt: new Date().toISOString(),
    });
    return { remoteId: result.post_id, photoId: result.id, status: "published" as const };
  }
  /** A missing correlation is never evidence of absence. Only a known Page post is read back. */
  async reconcile(post: unknown, signal?: AbortSignal) {
    if (!record(post) || post.remoteKind === "reel" || !nonempty(post.remoteId))
      return { status: "unknown" as const };
    const result = await this.call(
      "GET",
      `${post.remoteId}?fields=id,is_published,scheduled_publish_time,created_time`,
      undefined,
      signal
    );
    if (!record(result) || !nonempty(result.id))
      throw new AdapterError("protocol", "Facebook read-back omitted Page post ID", true);
    return {
      status:
        result.is_published === true
          ? ("published" as const)
          : result.scheduled_publish_time
            ? ("scheduled" as const)
            : ("unknown" as const),
      remoteId: result.id,
      ...(typeof result.created_time === "string" ? { publishedAt: result.created_time } : {}),
    };
  }
  /** Reels intentionally have no cancellation path; this is only a known Page-post deletion request. */
  async cancel(post: unknown, signal?: AbortSignal) {
    if (this.config.executionMode !== "live")
      throw new AdapterError("rejected", "Facebook mutation is blocked in preview mode");
    if (!record(post) || post.remoteKind !== "page-post" || !nonempty(post.remoteId))
      return { status: "unknown" as const };
    this.authorize(post, "cancel");
    const result = await this.callUrl("DELETE", this.url(post.remoteId), undefined, signal);
    if (!record(result) || result.success !== true)
      throw new AdapterError("protocol", "Facebook cancellation was not acknowledged", true);
    return { status: "cancelled" as const, remoteId: post.remoteId };
  }
}
