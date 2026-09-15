import { createHash } from "node:crypto";
import {
  fileIntegrity as validFile,
  assertSourcePermission as assertPermission,
  reviewCriteria as criteria,
  validReview,
} from "./domain.ts";
import { copyFileSync, mkdirSync, readFileSync, statfsSync } from "node:fs";
import { extname, join } from "node:path";
import { today, type Context, type Command } from "./types.ts";
import { deferQuotaTask, quotaBlocked } from "./deployment/quota.ts";
import { parseRecommendation } from "./deployment/contracts.ts";
import type { RecordData } from "./store.ts";

export type Segment = { startMs: number; endMs: number };
export type Artifact = RecordData & {
  kind: "video" | "image" | "text";
  origin: "daily" | "custom" | "reserve";
  topic: string;
  ageSegment: string;
  status: string;
  sourceIds: string[];
  createdAt: string;
  versions: RecordData[];
};
function intervals(value: unknown): Segment[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some(
      (s) =>
        !Number.isInteger(s.startMs) ||
        !Number.isInteger(s.endMs) ||
        s.startMs < 0 ||
        s.endMs <= s.startMs
    )
  )
    throw new Error("Original source intervals are required");
  const sorted = [...value].sort((a, b) => a.startMs - b.startMs);
  if (sorted.some((s, i) => i > 0 && s.startMs < sorted[i - 1].endMs))
    throw new Error("Source intervals overlap within this clip");
  return sorted;
}
function problem(version: number, criterion: string, evidence: string, correction: string) {
  return {
    version,
    location: "artifact",
    criterion,
    evidence,
    correction,
    acceptanceCondition: correction,
  };
}
async function inspect(
  ctx: Context,
  artifact: Artifact,
  version: RecordData,
  source: RecordData | undefined,
  signal: AbortSignal
) {
  const findings: Record<string, unknown>[] = [];
  let evidence: Record<string, unknown> = {};
  try {
    version.integrity = validFile(version.filePath);
    if (!ctx.adapters.media?.inspect)
      throw new Error("Independent media inspection adapter unavailable");
    const inspected = await ctx.adapters.media.inspect({
      filePath: version.filePath,
      kind: artifact.kind,
      source,
      segments: artifact.segments,
      signal,
    });
    signal.throwIfAborted();
    evidence = (inspected.evidence as Record<string, unknown>) ?? {};
    if (inspected.valid !== true) throw new Error("Media inspection rejected file");
    if (artifact.kind === "text") {
      evidence.text = readFileSync(version.filePath, "utf8");
      if (!/[\u0980-\u09ff]/u.test(evidence.text as string))
        throw new Error("Bangla text is missing");
    } else if (artifact.kind === "image") {
      if (!Array.isArray(evidence.frames) || !evidence.frames.length)
        throw new Error("Image review evidence is missing");
      for (const frame of evidence.frames)
        validFile(typeof frame === "string" ? frame : frame.filePath);
    } else {
      if (
        !(inspected.durationSeconds >= 30 && inspected.durationSeconds <= 60) ||
        !(inspected.width > 0) ||
        Math.abs(inspected.width / inspected.height - 9 / 16) > 0.015
      )
        throw new Error("Reel must be vertical 9:16 and 30–60 seconds");
      if (
        !Array.isArray(evidence.frames) ||
        !evidence.frames.length ||
        typeof evidence.transcript !== "string" ||
        !evidence.transcript.trim() ||
        (evidence.audio as { intelligible?: boolean })?.intelligible !== true ||
        !(evidence.audio as { coverage?: unknown })?.coverage
      )
        throw new Error("Timestamped frame, transcript and audio inspection evidence required");
      for (const frame of evidence.frames) {
        if (
          !frame ||
          typeof frame !== "object" ||
          !Number.isFinite(frame.timeMs) ||
          frame.timeMs < 0 ||
          frame.timeMs > inspected.durationSeconds * 1000
        )
          throw new Error("Every video evidence frame requires a valid output timestamp");
        validFile(frame.filePath);
      }
      if (!evidence.coverage || !evidence.limitations)
        throw new Error("Video review coverage and limitations must be recorded");
    }
  } catch (error: unknown) {
    signal.throwIfAborted();
    const err = error as { code?: string; kind?: string };
    if (
      ["RATE_LIMIT", "QUOTA_EXCEEDED", "rate_limit", "rate-limit", "quota"].includes(
        err.code ?? err.kind ?? ""
      )
    )
      throw error;
    findings.push(
      problem(
        version.number,
        "usability",
        String(error),
        "Provide a valid Bangla artifact and complete independent inspection evidence"
      )
    );
  }
  if (
    ctx.adapters.reviewer === ctx.adapters.editor ||
    (ctx.adapters.editor?.executionIdentity &&
      ctx.adapters.editor.executionIdentity === ctx.adapters.reviewer?.executionIdentity) ||
    !ctx.adapters.reviewer?.review
  )
    findings.push(
      problem(
        version.number,
        "independence",
        "No independent reviewer",
        "Use a separate reviewer adapter"
      )
    );
  if (findings.length) return { passed: false, findings, evidence };
  signal.throwIfAborted();
  const review = await ctx.adapters.reviewer.review({
    artifact,
    version,
    evidence,
    mission: ctx.mission,
    source,
    signal,
  });
  signal.throwIfAborted();
  if (version.provider?.threadId && version.provider.threadId === review?.provider?.threadId)
    findings.push(
      problem(
        version.number,
        "independence",
        "Editor and reviewer reused the same provider thread",
        "Review in a fresh independent provider thread"
      )
    );
  const failed = criteria.filter((key) => review?.criteria?.[key] !== true);
  const malformed =
    !validReview(review) || review.findings.some((f) => f.version !== version.number);
  if (malformed)
    findings.push(
      problem(
        version.number,
        "review-schema",
        "Malformed review findings",
        "Return version, location, criterion, evidence, correction and acceptanceCondition for each finding"
      )
    );
  for (const key of failed)
    if (!review?.findings?.some((f: { criterion?: string }) => f.criterion === key))
      findings.push(
        problem(
          version.number,
          key,
          "Hard requirement missing or rejected",
          `Supply evidence satisfying ${key}`
        )
      );
  return {
    ...review,
    passed:
      review?.passed === true &&
      !failed.length &&
      !malformed &&
      !review.findings.length &&
      !findings.length,
    findings: [...(Array.isArray(review?.findings) ? review.findings : []), ...findings],
    evidence,
  };
}

/** A logical task spends its allowance once, even when a transport failure spans days. */
function claimWorkload(ctx: Context, taskId: string): boolean {
  return ctx.store.transaction(() => {
    const chargeId = `workload-charge:${taskId}`;
    if (ctx.store.get("meta", chargeId)) return true;
    const date = today(ctx);
    const budgetId = `workload-day:${date}`;
    const budget = ctx.store.get<RecordData>("meta", budgetId) ?? { id: budgetId, date, count: 0 };
    if (budget.count >= ctx.config.limits.maxTasksPerDay) return false;
    ctx.store.put("meta", { ...budget, count: budget.count + 1 });
    ctx.store.put("meta", { id: chargeId, taskId, date, chargedAt: ctx.now().toISOString() });
    return true;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function production(ctx: Context, command: Command): Promise<any> {
  const store = ctx.store;
  if (command.type === "qualify-source") {
    if (typeof command.sourceId !== "string" || !command.sourceId)
      throw new Error("Source ID required");
    const source = store.get<RecordData>("sources", command.sourceId);
    if (!source) throw new Error("Unknown source");
    assertPermission(source, ctx.now(), { requireStoredIntegrity: true });
    if (!ctx.adapters.media?.inspectSource || !ctx.adapters.qualifier?.qualify)
      throw new Error("Source inspection and isolated qualification adapters are required");
    const taskId = `qualification:${command.requestId ?? source.id}`;
    const prior = store.get<RecordData>("tasks", taskId);
    if (prior?.status === "completed") return prior.result;
    const owner = ctx.id();
    store.put("tasks", {
      id: taskId,
      status: "running",
      sourceId: source.id,
      leaseOwner: owner,
      leaseUntil: new Date(ctx.now().getTime() + ctx.config.limits.leaseMs).toISOString(),
    });
    const inspection = await ctx.adapters.media.inspectSource({
      filePath: source.filePath,
      sourceIntegrity: source.integrity,
      signal: command.signal,
    });
    if (
      !inspection ||
      !Array.isArray(inspection.frames) ||
      !inspection.frames.length ||
      typeof inspection.transcript !== "string" ||
      !inspection.transcript.trim() ||
      !Number.isSafeInteger(inspection.durationMs) ||
      inspection.durationMs <= 0
    )
      throw new Error("Source inspection requires timed frames, transcript and duration");
    const decision = await ctx.adapters.qualifier.qualify({
      source: { id: source.id, language: source.language, integrity: source.integrity },
      inspection: {
        frames: inspection.frames,
        transcript: inspection.transcript,
        limitations: inspection.limitations ?? [],
      },
      mission: ctx.mission,
      topic: command.topic ?? ctx.config.topic,
      signal: command.signal,
    });
    const candidateSets = Array.isArray(decision?.candidateSets) ? decision.candidateSets : [];
    const validSets = candidateSets
      .map((set: unknown) => intervals(set))
      .filter((set: Segment[]) => {
        const total = set.reduce((sum, segment) => sum + segment.endMs - segment.startMs, 0);
        return (
          total >= 30_000 &&
          total <= 60_000 &&
          set.every((segment) => segment.endMs <= inspection.durationMs)
        );
      });
    if (
      !validSets.length ||
      !["relevant", "credible", "locallyRelevant"].every((key) => decision?.[key] === true)
    )
      throw new Error(
        "Qualification needs supported relevance, credibility, local relevance and in-bounds 30–60 second candidates"
      );
    const evidence = validFile(inspection.evidencePath);
    const qualification = {
      sourceId: source.id,
      sourceSha256: source.integrity.sha256,
      missionVersion: ctx.mission.version,
      topic: command.topic ?? ctx.config.topic,
      topics: decision.topics ?? [command.topic ?? ctx.config.topic],
      segments: validSets[0],
      candidateSets: validSets,
      evidencePath: inspection.evidencePath,
      evidenceSha256: evidence.sha256,
      reviewerIdentity: decision.reviewerIdentity ?? "isolated-qualifier",
      qualifiedAt: ctx.now().toISOString(),
      relevant: true,
      credible: true,
      actualContentReviewed: true,
      locallyRelevant: true,
      limitations: [...(inspection.limitations ?? []), ...(decision.limitations ?? [])],
    };
    const updated = {
      ...source,
      metadata: {
        ...source.metadata,
        qualified: true,
        topic: qualification.topic,
        topics: qualification.topics,
        segments: qualification.segments,
        candidateSets: qualification.candidateSets,
        qualification,
      },
    };
    store.transaction(() => {
      store.put("qualifications", {
        id: `${source.id}:${source.integrity.sha256}:${ctx.mission.version}`,
        ...qualification,
      });
      store.put("sources", updated);
      store.put("tasks", { id: taskId, status: "completed", sourceId: source.id, result: updated });
    });
    return updated;
  }
  if (command.type === "discover") {
    if (!ctx.adapters.discovery?.discover) throw new Error("Discovery adapter is not configured");
    const taskId = `discovery:${command.requestId ?? ctx.id()}`;
    const topic = command.topic ?? ctx.config.topic;
    const owner = ctx.id();
    const claim = store.transaction(() => {
      const previous = store.get<RecordData>("meta", taskId);
      if (previous && previous.topic !== topic)
        throw new Error("Discovery request ID is already owned by a different topic");
      if (previous?.result) return { result: previous.result };
      if (previous?.status === "started" && Date.parse(previous.leaseUntil) > ctx.now().getTime())
        return { result: { status: "running", taskId } };
      if (!claimWorkload(ctx, taskId))
        return { result: { status: "deferred", reason: "workload-limit" } };
      const batchId = previous?.batchId ?? ctx.id();
      store.put("meta", {
        id: taskId,
        batchId,
        topic,
        status: "started",
        leaseOwner: owner,
        leaseUntil: new Date(ctx.now().getTime() + ctx.config.limits.leaseMs).toISOString(),
      });
      return { batchId };
    });
    if ("result" in claim) return claim.result;
    const batchId = claim.batchId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    try {
      result = await ctx.adapters.discovery.discover({
        topic,
        mission: ctx.mission,
        language: "bn",
        untrustedSourceContent: true,
        idempotencyKey: taskId,
      });
    } catch (error) {
      if (store.get<RecordData>("meta", taskId)?.leaseOwner === owner)
        store.put("meta", {
          id: taskId,
          batchId,
          topic,
          status: "failed",
          lastError: String(error),
        });
      throw error;
    }
    if (store.get<RecordData>("meta", taskId)?.leaseOwner !== owner)
      throw new Error("Discovery ownership lost");
    if (!Array.isArray(result?.keywords) || !Array.isArray(result.sources))
      throw new Error("Malformed discovery result");
    const keywords = (result.keywords as Array<Record<string, unknown>>).map((keyword) => {
      if (!keyword.query || !keyword.language || !keyword.intent)
        throw new Error("Keyword requires query, language and intent");
      return {
        ...keyword,
        externalId: keyword.id,
        id: `${batchId}:${(keyword.id as string) ?? ctx.id()}`,
        batchId,
        topic,
        missionVersion: ctx.mission.version,
      };
    });
    const sources = (result.sources as Array<Record<string, unknown>>).map((source) => {
      if (!source.id || !source.title) throw new Error("Source identity and title required");
      const existing = store.get<RecordData>("sources", source.id as string);
      const metadata = {
        ...existing?.metadata,
        ...source,
        ...(source.metadata as Record<string, unknown>),
      };
      delete metadata.permission;
      delete metadata.filePath;
      delete metadata.metadata;
      const qualification = metadata.qualification as Record<string, unknown> | undefined;
      metadata.qualified = false;
      if (
        qualification &&
        ["relevant", "credible", "actualContentReviewed", "locallyRelevant"].every(
          (key) => qualification[key] === true
        )
      ) {
        try {
          const integrity = validFile(qualification.evidencePath as string);
          metadata.segments = intervals(metadata.segments);
          metadata.qualification = {
            ...qualification,
            integrity,
            missionVersion: ctx.mission.version,
          };
          metadata.qualified = true;
        } catch {
          metadata.qualified = false;
        }
      }
      return {
        ...existing,
        id: source.id as string,
        title: source.title,
        language: source.language,
        metadata,
        status: existing?.status ?? "pending",
        discoveredAt: existing?.discoveredAt ?? ctx.now().toISOString(),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recommendations: any[] = [];
    store.transaction(() => {
      store.put("keyword_batches", {
        id: batchId!,
        topic,
        mission: ctx.mission,
        createdAt: ctx.now().toISOString(),
      });
      for (const keyword of keywords) store.put("keywords", keyword);
      for (const source of sources) store.put("sources", source);
      for (const match of (result.matches ?? []) as Record<string, unknown>[]) {
        const keyword = keywords.find(
          (k) => k.externalId === match.keywordId || k.id === match.keywordId
        );
        if (!keyword || !sources.some((s) => s.id === match.sourceId))
          throw new Error("Discovery match references unknown keyword or source");
        store.put("matches", {
          ...match,
          keywordId: keyword.id,
          id: `${batchId}:${keyword.id}:${match.sourceId}`,
          batchId,
        });
      }
      for (const proposed of (result.recommendations ?? []) as Record<string, unknown>[]) {
        const source = sources.find((candidate) => candidate.id === proposed.sourceId);
        if (!source) throw new Error("Recommendation references unknown source");
        const recommendation = parseRecommendation({
          ...proposed,
          id: `${batchId}:${proposed.sourceId}`,
          topic,
          batchId,
          discoveredAt: ctx.now().toISOString(),
          canonicalUrl: proposed.canonicalUrl ?? source.metadata.canonicalUrl,
          title: proposed.title ?? source.title,
          language: proposed.language ?? source.language ?? null,
          tentativeSegments: [],
        });
        const existing = store.get<RecordData>("recommendations", recommendation.id);
        const saved = store.put("recommendations", existing ?? recommendation);
        recommendations.push(saved);
        const day = today(ctx);
        const notificationId = `recommendation:${day}:${topic}:${recommendation.sourceId}`;
        if (!store.get("notifications", notificationId))
          store.put("notifications", {
            id: notificationId,
            status: "queued",
            createdAt: ctx.now().toISOString(),
            event: {
              type: "source-recommendation",
              recommendationId: saved.id,
              message:
                "অনুমতি-সমর্থিত স্থানীয় ভিডিও ও permission.json/READY ফোল্ডার দিয়ে জমা দিন; আবিষ্কার অনুমতি নয়।",
            },
          });
      }
    });
    const completed = { batchId, keywords, sources, recommendations, coverage: result.coverage };
    store.put("meta", { id: taskId, batchId, topic, status: "completed", result: completed });
    return completed;
  }
  if (command.type === "register-source") {
    if (typeof command.sourceId !== "string" || !command.sourceId)
      throw new Error("Source ID required");
    const existingSource = store.get<RecordData>("sources", command.sourceId);
    const source = {
      ...existingSource,
      id: command.sourceId,
      language: command.language ?? existingSource?.language,
      filePath: command.filePath,
      permission: command.permission,
      status: "cleared",
    };
    assertPermission(source, ctx.now());
    const sourceIntegrity = validFile(source.filePath);
    const permissionIntegrity = validFile(source.permission.evidencePath);
    const lineageDirectory = join(
      ctx.config.storage.mediaDirectory,
      "sources",
      createHash("sha256").update(source.id).digest("hex")
    );
    mkdirSync(lineageDirectory, { recursive: true });
    const retainedSource = join(
      lineageDirectory,
      `${sourceIntegrity.sha256}${extname(source.filePath) || ".bin"}`
    );
    const retainedPermission = join(
      lineageDirectory,
      `permission-${permissionIntegrity.sha256}${extname(source.permission.evidencePath) || ".txt"}`
    );
    if (source.filePath !== retainedSource) copyFileSync(source.filePath, retainedSource);
    if (source.permission.evidencePath !== retainedPermission)
      copyFileSync(source.permission.evidencePath, retainedPermission);
    Object.assign(source, {
      filePath: retainedSource,
      integrity: sourceIntegrity,
      permission: {
        ...source.permission,
        evidencePath: retainedPermission,
        integrity: permissionIntegrity,
      },
    });
    store.put("sources", source);
    store.put("permissions", {
      id: ctx.id(),
      sourceId: source.id,
      ...source.permission,
      registeredAt: ctx.now().toISOString(),
    });
    return source;
  }
  let artifact: Artifact;
  if (command.type === "retry-artifact") {
    const failed = store.get<Artifact>("artifacts", command.artifactId);
    if (!failed || failed.status !== "failed")
      throw new Error("Manual retry requires a failed artifact");
    if (!command.reason) throw new Error("Manual retry requires a reason");
    const existingRetry = store
      .all<Artifact>("artifacts")
      .find(
        (a) =>
          a.retryOf === failed.id &&
          (a.status !== "failed" || (command.requestId && a.requestId === command.requestId))
      );
    if (existingRetry) return existingRetry;
    artifact = {
      ...failed,
      id: ctx.id(),
      retryOf: failed.id,
      attemptRoot: failed.attemptRoot ?? failed.id,
      requestId: command.requestId ?? ctx.id(),
      status: "producing",
      versions: [],
      lastError: undefined,
      createdAt: ctx.now().toISOString(),
      leaseOwner: null,
      leaseUntil: null,
    };
    store.put("manual_retries", {
      id: ctx.id(),
      artifactId: failed.id,
      newArtifactId: artifact.id,
      reason: command.reason,
      createdAt: ctx.now().toISOString(),
    });
  } else {
    if (
      !["video", "image", "text"].includes(command.kind) ||
      !["daily", "custom", "reserve"].includes(command.origin)
    )
      throw new Error("Valid production kind and origin required");
    const existing =
      command.requestId &&
      store.all<Artifact>("artifacts").find((a) => a.requestId === command.requestId);
    if (existing) {
      if (
        existing.kind !== command.kind ||
        existing.origin !== command.origin ||
        (command.topic && existing.topic !== command.topic) ||
        (command.ageSegment && existing.ageSegment !== command.ageSegment) ||
        (command.sourceId && existing.sourceIds[0] !== command.sourceId) ||
        (command.segments &&
          JSON.stringify(existing.segments) !== JSON.stringify(intervals(command.segments)))
      )
        throw new Error("Request ID is already owned by different work");
      if (existing.status !== "producing" || Date.parse(existing.leaseUntil) > ctx.now().getTime())
        return existing;
      artifact = existing;
    } else
      artifact = {
        id: ctx.id(),
        kind: command.kind,
        origin: command.origin,
        topic: command.topic ?? ctx.config.topic,
        ageSegment: command.ageSegment ?? "general",
        status: "producing",
        sourceIds: command.sourceId ? [command.sourceId] : [],
        segments: command.segments,
        createdAt: ctx.now().toISOString(),
        date: command.date,
        requestId: command.requestId,
        versions: [],
        mission: ctx.mission,
      };
  }
  if (
    artifact.ageSegment !== "general" &&
    !ctx.config.audience.segments.includes(artifact.ageSegment)
  )
    throw new Error("Unconfigured age segment");
  const backoff = store.get<RecordData>("meta", "production-backoff");
  if (!ctx.config.deployment && backoff && Date.parse(backoff.until) > ctx.now().getTime())
    return { status: "deferred", until: backoff.until, reason: "provider-backoff" };
  if (ctx.config.deployment && quotaBlocked(store, "codex", ctx.now()))
    return { status: "deferred", reason: "codex-quota" };
  const filesystem = statfsSync(ctx.config.storage.mediaDirectory);
  const freeBytes = ctx.adapters.storage?.freeBytes
    ? await ctx.adapters.storage.freeBytes()
    : filesystem.bavail * filesystem.bsize;
  if (freeBytes < ctx.config.limits.minFreeBytes) {
    await ctx.notify({ type: "low-space", message: "Production paused: insufficient free space" });
    return { status: "deferred", reason: "low-space" };
  }
  if (ctx.adapters.capacity?.check) {
    const capacity = await ctx.adapters.capacity.check();
    if (capacity.remaining !== null && capacity.remaining <= 0)
      return { status: "deferred", reason: "provider-capacity" };
  }
  const source = artifact.sourceIds[0]
    ? store.get<RecordData>("sources", artifact.sourceIds[0])
    : undefined;
  const owner = ctx.id();
  const acquired = store.transaction(() => {
    const retryOwner =
      artifact.retryOf &&
      store
        .all<Artifact>("artifacts")
        .find(
          (a) => a.retryOf === artifact.retryOf && a.id !== artifact.id && a.status !== "failed"
        );
    if (retryOwner) return retryOwner;
    const requestOwner =
      artifact.requestId &&
      store
        .all<Artifact>("artifacts")
        .find((a) => a.requestId === artifact.requestId && a.id !== artifact.id);
    if (requestOwner) {
      if (
        requestOwner.kind !== artifact.kind ||
        requestOwner.origin !== artifact.origin ||
        requestOwner.topic !== artifact.topic ||
        requestOwner.ageSegment !== artifact.ageSegment ||
        JSON.stringify(requestOwner.sourceIds) !== JSON.stringify(artifact.sourceIds) ||
        JSON.stringify(requestOwner.segments) !== JSON.stringify(artifact.segments)
      )
        throw new Error("Request ID is already owned by different work");
      return requestOwner;
    }
    const fresh = store.get<Artifact>("artifacts", artifact.id);
    if (fresh?.leaseOwner && Date.parse(fresh.leaseUntil) > ctx.now().getTime())
      throw new Error("Artifact already owned by an active worker");
    const active = store
      .all<Artifact>("artifacts")
      .filter((a) => a.status === "producing" && Date.parse(a.leaseUntil) > ctx.now().getTime());
    if (active.length >= ctx.config.limits.concurrency)
      throw new Error("Production concurrency limit reached");
    if (!claimWorkload(ctx, `production:${artifact.id}`))
      return { status: "deferred", reason: "workload-limit" };
    if (artifact.kind === "video") {
      // A source may have been qualified days earlier; every render must
      // revalidate the retained bytes before consuming its reserved interval.
      assertPermission(source, ctx.now(), { requireStoredIntegrity: true });
      artifact.segments = intervals(artifact.segments);
      artifact.sourceEvidence = {
        sourceId: source!.id,
        filePath: source!.filePath,
        integrity: source!.integrity,
        permission: structuredClone(source!.permission),
      };
      if (
        artifact.origin === "daily" &&
        artifact.date &&
        store
          .all<Artifact>("artifacts")
          .some(
            (a) =>
              a.id !== artifact.id &&
              a.origin === "daily" &&
              a.date === artifact.date &&
              a.status !== "failed" &&
              a.sourceIds.includes(source!.id)
          )
      )
        throw new Error("Daily clips require distinct source videos");
      for (const segment of artifact.segments) {
        const overlap = store
          .all<RecordData>("segments")
          .find(
            (s) =>
              s.sourceId === source!.id &&
              s.artifactId !== artifact.id &&
              s.attemptRoot !== (artifact.attemptRoot ?? artifact.id) &&
              s.startMs < segment.endMs &&
              segment.startMs < s.endMs
          );
        if (overlap && command.allowReuse !== true)
          throw new Error("Source interval already reserved or used; explicit reuse required");
      }
      for (const segment of artifact.segments)
        store.put("segments", {
          id: `${artifact.id}:${segment.startMs}:${segment.endMs}`,
          artifactId: artifact.id,
          attemptRoot: artifact.attemptRoot ?? artifact.id,
          sourceId: source!.id,
          ...segment,
          status: "reserved",
          explicitReuse: command.allowReuse === true,
        });
    }
    artifact.leaseOwner = owner;
    artifact.leaseUntil = new Date(ctx.now().getTime() + ctx.config.limits.leaseMs).toISOString();
    store.put("artifacts", artifact);
  });
  if (acquired) return acquired;
  return produceArtifact(ctx, artifact, command, source, owner);
}

/** Runs the render-and-review loop for one artifact. Caller has already acquired the lease. */
async function produceArtifact(
  ctx: Context,
  artifact: Artifact,
  command: Command,
  source: RecordData | undefined,
  owner: string
): Promise<Artifact> {
  const store = ctx.store;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bounded = async (operation: (signal: AbortSignal) => Promise<any>): Promise<any> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Production task timed out; manual retry required"));
          }, ctx.config.limits.taskTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const owned = () => {
    if (store.get<Artifact>("artifacts", artifact.id)?.leaseOwner !== owner)
      throw new Error("Production ownership lost");
  };
  try {
    if (!ctx.adapters.editor?.create) throw new Error("Editor adapter is not configured");
    while (artifact.versions.length < 3 || !artifact.versions.at(-1)?.review) {
      owned();
      let version = artifact.versions.at(-1);
      if (!version || version.review) {
        version = {
          id: ctx.id(),
          number: artifact.versions.length + 1,
          status: "rendering",
          createdAt: ctx.now().toISOString(),
        };
        artifact.versions.push(version);
        store.put("artifacts", artifact);
      }
      if (!version.filePath) {
        const outputDirectory = join(
          ctx.config.storage.mediaDirectory,
          artifact.kind,
          artifact.id,
          `v${version.number}`
        );
        mkdirSync(outputDirectory, { recursive: true });
        const previous = artifact.versions.at(-2);
        artifact.leaseUntil = new Date(
          ctx.now().getTime() + ctx.config.limits.leaseMs
        ).toISOString();
        store.put("artifacts", artifact);
        const result = await bounded((signal) =>
          ctx.adapters.editor.create({
            signal,
            artifact,
            version: version.number,
            mission: ctx.mission,
            source,
            feedback: previous?.review?.findings ?? [],
            outputDirectory,
            idempotencyKey: version!.id,
          })
        );
        owned();
        if (!result || typeof result.caption !== "string")
          throw new Error("Editor must return artifact path and caption");
        if (
          artifact.kind === "video" &&
          result.segments &&
          JSON.stringify(intervals(result.segments)) !== JSON.stringify(artifact.segments)
        )
          throw new Error("Editor changed reserved source intervals");
        validFile(result.filePath);
        const retainedPath = join(outputDirectory, `artifact${extname(result.filePath) || ".bin"}`);
        if (result.filePath !== retainedPath) copyFileSync(result.filePath, retainedPath);
        Object.assign(version, {
          ...result,
          filePath: retainedPath,
          id: version.id,
          number: version.number,
          status: "rendered",
        });
        store.put("artifacts", artifact);
      }
      artifact.leaseUntil = new Date(ctx.now().getTime() + ctx.config.limits.leaseMs).toISOString();
      store.put("artifacts", artifact);
      version.review = await bounded((signal) => inspect(ctx, artifact, version, source, signal));
      owned();
      store.put("reviews", {
        id: version.id,
        artifactId: artifact.id,
        version: version.number,
        ...version.review,
        mission: ctx.mission,
      });
      version.status = version.review.passed ? "approved" : "rejected";
      store.put("artifacts", artifact);
      if (version.review.passed) {
        if (source) assertPermission(source, ctx.now());
        artifact.status = "approved";
        artifact.filePath = version.filePath;
        artifact.caption = version.caption;
        artifact.approvedAt = ctx.now().toISOString();
        store.transaction(() => {
          owned();
          store.put("artifacts", artifact);
          for (const segment of store
            .all<RecordData>("segments")
            .filter((s) => s.artifactId === artifact.id))
            store.put("segments", { ...segment, status: "used" });
        });
        break;
      }
    }
    if (artifact.status !== "approved") {
      artifact.status = "failed";
      artifact.lastError = "Independent review exhausted three total versions";
    }
  } catch (error: unknown) {
    owned();
    const err = error as { message?: string; code?: string; kind?: string };
    artifact.lastError = String(err.message ?? error);
    if (
      ["RATE_LIMIT", "QUOTA_EXCEEDED", "rate_limit", "rate-limit", "quota"].includes(
        err.code ?? err.kind ?? ""
      )
    ) {
      if (ctx.config.deployment)
        deferQuotaTask(store, {
          taskId: `artifact:${artifact.id}`,
          role: "generation",
          provider: "codex",
          model: "configured",
          sessionRef: null,
          now: ctx.now(),
        });
      else {
        const until = new Date(ctx.now().getTime() + ctx.config.limits.backoffMs).toISOString();
        store.put("meta", { id: "production-backoff", until });
      }
      artifact.status = "producing";
    } else artifact.status = "failed";
  } finally {
    if (store.get<Artifact>("artifacts", artifact.id)?.leaseOwner === owner) {
      artifact.leaseOwner = null;
      artifact.leaseUntil = ctx.now().toISOString();
      store.put("artifacts", artifact);
    }
  }
  if (artifact.origin !== "reserve" || artifact.status === "failed")
    await ctx.notify({
      type: artifact.status === "approved" ? "artifact-ready" : "artifact-failed",
      artifactId: artifact.id,
      origin: artifact.origin,
      filePath: artifact.filePath,
      error: artifact.lastError,
    });
  return artifact;
}
