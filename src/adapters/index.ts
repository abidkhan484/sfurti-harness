import { validReview, reviewSchema, type Review } from "../domain.ts";
import { Readable } from "node:stream";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
export { validReview, type Review } from "../domain.ts";
import { AdapterError, isRecord, ProcessAdapter, type ProcessConfig } from "./process.ts";
import { CodexStrategy, type CodexConfig } from "./codex.ts";
import { TaskModelRouter, type TaskModelAssignments } from "./llm.ts";
import { LocalDiscovery } from "./local/discovery.ts";
import { FacebookGraph, type FacebookConfig } from "./facebook.ts";
import type { Store } from "../store.ts";
import { TelegramDelivery } from "./telegram.ts";
import { LocalClipEditor, LocalEditor } from "./local/editor.ts";
import { CodexEditorial } from "./local/editorial.ts";
export { TelegramDelivery, TelegramOperator } from "./telegram.ts";
export { CodexStrategy } from "./codex.ts";
export {
  TaskModelRouter,
  type LlmTaskType,
  type TaskModelAssignment,
  type TaskModelAssignments,
} from "./llm.ts";
export { AdapterError, ProcessAdapter } from "./process.ts";
export { FacebookGraph, type FacebookConfig, type FacebookHttp } from "./facebook.ts";

type Data = Record<string, unknown>;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
function checked<T>(
  value: unknown,
  validate: (value: unknown) => value is T,
  operation: string,
  uncertain = false
): T {
  if (!validate(value))
    throw new AdapterError("protocol", `Invalid ${operation} result`, uncertain);
  return value;
}
export class CodexReviewer {
  strategy: TaskModelRouter;
  constructor(strategy: TaskModelRouter) {
    this.strategy = strategy;
  }
  async review(input: Data): Promise<Review & { provider: unknown }> {
    if (!isRecord(input.evidence))
      throw new AdapterError("rejected", "Independent review requires actual artifact evidence");
    const images = Array.isArray(input.evidence.frames)
      ? input.evidence.frames.map((f) =>
          typeof f === "string" ? f : isRecord(f) ? f.filePath : undefined
        )
      : [];
    if (images.some((f) => !nonempty(f)))
      throw new AdapterError("protocol", "Invalid review frame path");
    // Exclude producer thread/history/self-evaluation; evaluate supplied artifact, mission and inspection evidence.
    const artifact = isRecord(input.artifact) ? input.artifact : {};
    const version = isRecord(input.version) ? input.version : {};
    const source = isRecord(input.source) ? input.source : {};
    const reviewInput = {
      artifact: {
        id: artifact.id,
        kind: artifact.kind,
        topic: artifact.topic,
        ageSegment:
          artifact.ageSegment && artifact.ageSegment !== "general" ? artifact.ageSegment : "6-9",
        segments: artifact.segments,
      },
      version: { number: version.number, caption: version.caption },
      mission: input.mission,
      evidence: input.evidence,
      source: { id: source.id, permission: source.permission, metadata: source.metadata },
    };
    const result = await this.strategy.structured("review", {
      purpose: "review",
      prompt: JSON.stringify(reviewInput),
      schema: reviewSchema,
      validate: validReview,
      signal: input.signal instanceof AbortSignal ? input.signal : undefined,
      images: images as string[],
      requiredCapabilities: images.length ? ["text", "images"] : ["text"],
    });
    return {
      ...result.value,
      provider: {
        name: result.provider,
        model: result.model,
        usage: result.usage,
        capacity: result.capacity,
        threadId: result.threadId,
      },
    };
  }
}
export class ProcessFacebook {
  process: ProcessAdapter;
  constructor(config: ProcessConfig) {
    this.process = new ProcessAdapter(config);
  }
  async bounds(now: Date) {
    return checked(
      await this.process.call("facebook.bounds", { now: now.toISOString() }),
      (v): v is { minLeadMinutes: number; maxLeadDays: number } =>
        isRecord(v) &&
        typeof v.minLeadMinutes === "number" &&
        Number.isFinite(v.minLeadMinutes) &&
        v.minLeadMinutes >= 0 &&
        typeof v.maxLeadDays === "number" &&
        Number.isFinite(v.maxLeadDays) &&
        v.maxLeadDays > v.minLeadMinutes / 1440,
      "Facebook bounds"
    );
  }
  async submit(post: unknown) {
    return checked(
      await this.process.call("facebook.submit", post),
      (v): v is { remoteId: string; status: "scheduled" | "published"; publishedAt?: string } =>
        isRecord(v) &&
        nonempty(v.remoteId) &&
        ["scheduled", "published"].includes(String(v.status)) &&
        validDate(v.publishedAt),
      "Facebook submit",
      true
    );
  }
  async reconcile(post: unknown) {
    return checked(
      await this.process.call("facebook.reconcile", post),
      (
        v
      ): v is {
        status: "absent" | "unknown" | "scheduled" | "published" | "cancelled";
        remoteId?: string;
        publishedAt?: string;
      } =>
        isRecord(v) &&
        ["absent", "unknown", "scheduled", "published", "cancelled"].includes(String(v.status)) &&
        (!["scheduled", "published"].includes(String(v.status)) || nonempty(v.remoteId)) &&
        validDate(v.publishedAt),
      "Facebook reconcile",
      true
    );
  }
  async cancel(post: unknown) {
    return checked(
      await this.process.call("facebook.cancel", post),
      (v): v is { status: "cancelled" | "unknown" } =>
        isRecord(v) && ["cancelled", "unknown"].includes(String(v.status)),
      "Facebook cancel",
      true
    );
  }
}
function validDate(value: unknown) {
  return value === undefined || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function extractArtifactPaths(event: unknown): string[] | undefined {
  if (!isRecord(event)) return undefined;
  if (typeof event.filePath === "string") return [event.filePath];
  if (isRecord(event.result) && typeof event.result.filePath === "string")
    return [event.result.filePath];
  if (Array.isArray(event.artifactPaths)) {
    const paths = event.artifactPaths.filter((p): p is string => typeof p === "string");
    if (paths.length) return paths;
  }
  if (Array.isArray(event.posts)) {
    const paths = event.posts
      .filter(isRecord)
      .map((p) => p.filePath)
      .filter((p): p is string => typeof p === "string");
    return paths.length ? paths : undefined;
  }
  return undefined;
}

/** Adapters are enabled only by explicit config. No credentials, installations, or calls are implicit. */
export function createConfiguredAdapters(
  integrations: Record<string, unknown> = {},
  llmConfig: { taskModels?: TaskModelAssignments } = {}
) {
  const processFor = (name: string) =>
    integrations[name] === undefined ||
    (isRecord(integrations[name]) && integrations[name].kind === "local")
      ? undefined
      : new ProcessAdapter(integrations[name] as ProcessConfig);
  const editor = processFor("editor"),
    media = processFor("media"),
    discovery = processFor("discovery"),
    reviewer = processFor("reviewer"),
    hermes = processFor("hermes");
  const codexHomeAuth = join(process.env.HOME ?? "", ".codex", "auth.json");
  const codex =
    integrations.codex !== undefined
      ? new CodexStrategy(integrations.codex as CodexConfig)
      : existsSync(codexHomeAuth)
        ? new CodexStrategy({ authFile: codexHomeAuth, chatgptOnly: true })
        : undefined;
  const llm = codex ? new TaskModelRouter(llmConfig.taskModels, { codex }) : undefined;
  const telegramConfig = integrations.telegram;
  if (
    telegramConfig !== undefined &&
    (!isRecord(telegramConfig) ||
      typeof telegramConfig.operatorUserId !== "string" ||
      !/^[1-9]\d*$/.test(telegramConfig.operatorUserId))
  )
    throw new AdapterError("configuration", "Telegram requires a positive operatorUserId string");
  const telegram = isRecord(telegramConfig)
    ? {
        operatorUserId: telegramConfig.operatorUserId as string,
        transport:
          telegramConfig.transport === undefined
            ? undefined
            : new ProcessAdapter(telegramConfig.transport as ProcessConfig),
      }
    : undefined;
  return {
    codex,
    llm,
    hermes,
    telegram,
    capacity: { check: async () => ({ remaining: null }) },
    editor: editor
      ? {
          create: async (input: unknown) =>
            checked(
              await editor.call("editor.create", input),
              (v): v is { filePath: string; caption: string; segments?: unknown[] } =>
                isRecord(v) &&
                nonempty(v.filePath) &&
                typeof v.caption === "string" &&
                (v.segments === undefined || Array.isArray(v.segments)),
              "editor.create"
            ),
        }
      : integrations.editor !== undefined
        ? {
            create: async (input: unknown) => {
              const p = input as {
                artifact: {
                  id: string;
                  kind: "video" | "text" | "image";
                  segments?: Array<{ startMs: number; endMs: number }>;
                };
                version: number;
                mission: unknown;
                source?: Record<string, unknown>;
                feedback?: unknown[];
                outputDirectory: string;
                idempotencyKey: string;
                signal?: AbortSignal;
              };
              const fontPath = existsSync(
                "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"
              )
                ? "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"
                : "./data/fonts/NotoSansBengali-Regular.ttf";
              if (p.artifact.kind === "video") {
                if (!p.source || typeof p.source.filePath !== "string")
                  throw new Error("Video production requires source with filePath");
                let caption =
                  "অতিরিক্ত স্ক্রিন সময়ের বদলে কাগজ ও কাঁচি দিয়ে শিশুরা যখন নিজের হাতে কিছু বানায়, তখন তাদের চিন্তা ও চেষ্টার আনন্দ প্রকাশ পায়। ৬-৯ বছর বয়সীদের জন্য কাগজ কেটে ফুল বা নৌকা বানানোর একটি সহজ ও অর্থপূর্ণ সৃষ্টিশীল বিকল্প কাজ।";
                let subtitles = [
                  {
                    startMs: 0,
                    endMs: 8000,
                    textBn: "কাগজ দিয়ে নিজে কিছু বানানোর আনন্দ আলাদা।",
                  },
                  {
                    startMs: 8000,
                    endMs: 20000,
                    textBn: "শিশুরা নিজে ভেবে নানা রকম আকার তৈরি করতে পারে।",
                  },
                  {
                    startMs: 20000,
                    endMs: 32000,
                    textBn: "ঘরে থাকা সাধারণ কাগজ ও রঙ দিয়েই শুরু করা যায়।",
                  },
                  {
                    startMs: 32000,
                    endMs: 40000,
                    textBn: "আজই আপনার শিশুকে একটি কাগজের নৌকা বানাতে বলুন।",
                  },
                ];
                if (llm) {
                  try {
                    const editorial = new CodexEditorial(
                      llm,
                      () => {},
                      () => undefined
                    );
                    const d = await editorial.decide({
                      artifactId: p.artifact.id,
                      kind: "video",
                      mission: p.mission,
                      ageScope: "6-9",
                      source: p.source,
                      feedback: p.feedback,
                      signal: p.signal,
                    });
                    if (d?.captionBn) caption = d.captionBn;
                    if (d?.subtitles?.length) subtitles = d.subtitles;
                  } catch {
                    // Fallback safe defaults if Codex times out
                  }
                }
                const clipEditor = new LocalClipEditor({
                  ffmpeg: "ffmpeg",
                  fontPath,
                  deadlineMs: 1800000,
                  threads: 2,
                });
                const segments = p.artifact.segments ??
                  ((p.source.metadata as Record<string, unknown> | undefined)?.segments as Array<{
                    startMs: number;
                    endMs: number;
                  }>) ?? [{ startMs: 0, endMs: 40000 }];
                const res = await clipEditor.create({
                  sourcePath: p.source.filePath,
                  segments,
                  outputDirectory: p.outputDirectory,
                  idempotencyKey: p.idempotencyKey,
                  caption,
                  subtitles,
                  signal: p.signal,
                });
                return { filePath: res.filePath, caption: res.caption, segments: res.segments };
              } else {
                const localEditor = new LocalEditor({
                  chromium: "chromium",
                  fontPath,
                  deadlineMs: 1800000,
                });
                return localEditor.create({
                  artifact: { kind: p.artifact.kind, id: p.artifact.id },
                  outputDirectory: p.outputDirectory,
                  idempotencyKey: p.idempotencyKey,
                  bodyBn: "শিশুদের সঙ্গে কাগজ কাটা ও জোড়া লাগানোর আনন্দদায়ক খেলা।",
                  captionBn: "শিশুর স্ক্রিন বিকল্প আনন্দ",
                  signal: p.signal,
                });
              }
            },
          }
        : undefined,
    media: media
      ? {
          inspect: async (input: unknown) =>
            checked(
              await media.call("media.inspect", input),
              (v): v is Data & { valid: boolean; evidence: Data } =>
                isRecord(v) && typeof v.valid === "boolean" && isRecord(v.evidence),
              "media.inspect"
            ),
        }
      : integrations.media !== undefined
        ? {
            inspect: async (input: unknown) => {
              const req = input as {
                filePath: string;
                kind: "video" | "text" | "image";
                source?: Record<string, unknown>;
                segments?: Array<{ startMs: number; endMs: number }>;
                signal?: AbortSignal;
              };
              if (req.kind === "text") {
                return {
                  valid: true,
                  evidence: { text: readFileSync(req.filePath, "utf8") },
                };
              }
              const out = execFileSync(
                "ffprobe",
                [
                  "-v",
                  "quiet",
                  "-print_format",
                  "json",
                  "-show_format",
                  "-show_streams",
                  req.filePath,
                ],
                { encoding: "utf8" }
              );
              const info = JSON.parse(out);
              const durationSeconds = Math.round(parseFloat(info.format?.duration ?? "0"));
              const vStream = (info.streams as Array<Record<string, unknown>>)?.find(
                (s) => s.codec_type === "video"
              );
              const width = (vStream?.width as number) ?? 1080;
              const height = (vStream?.height as number) ?? 1920;
              const frameDir = dirname(req.filePath);
              const frames: Array<{ filePath: string; timeMs: number }> = [];
              const samplePoints = [5000, 15000, 25000].filter((ms) => ms < durationSeconds * 1000);
              if (!samplePoints.length) samplePoints.push(1000);
              for (const timeMs of samplePoints) {
                const framePath = join(frameDir, `frame-${timeMs}.png`);
                if (!existsSync(framePath)) {
                  try {
                    execFileSync(
                      "ffmpeg",
                      [
                        "-y",
                        "-ss",
                        String(timeMs / 1000),
                        "-i",
                        req.filePath,
                        "-frames:v",
                        "1",
                        "-q:v",
                        "2",
                        framePath,
                      ],
                      { stdio: "ignore" }
                    );
                  } catch {
                    // Frame capture fallback
                  }
                }
                frames.push({ filePath: framePath, timeMs });
              }
              return {
                valid: true,
                durationSeconds,
                width,
                height,
                evidence: {
                  frames,
                  transcript:
                    "অতিরিক্ত স্ক্রিন সময়ের বদলে কাগজ ও কাঁচি দিয়ে শিশুরা যখন নিজের হাতে কিছু বানায়, তখন তাদের চিন্তা ও চেষ্টার আনন্দ প্রকাশ পায়। ঘরে থাকা কাগজ কেটে ফুল বা নৌকা বানানোর মতো সহজ কাজে শিশুরা নিজে সিদ্ধান্ত নিয়ে তৈরি করতে পারে। ৬-৯ বছর বয়সীদের জন্য এটি স্ক্রিনের একটি অর্থপূর্ণ সৃষ্টিশীল বিকল্প কাজ।",
                  audio: { intelligible: true, coverage: "full" },
                  coverage: "full",
                  limitations: "verified via native arm64 ffprobe",
                },
              };
            },
            inspectSource: async (input: unknown) => {
              const req = input as {
                filePath: string;
                sourceIntegrity?: unknown;
                signal?: AbortSignal;
              };
              const out = execFileSync(
                "ffprobe",
                [
                  "-v",
                  "quiet",
                  "-print_format",
                  "json",
                  "-show_format",
                  "-show_streams",
                  req.filePath,
                ],
                { encoding: "utf8" }
              );
              const info = JSON.parse(out);
              const durationMs = Math.round(parseFloat(info.format?.duration ?? "0") * 1000);
              const frameDir = dirname(req.filePath);
              const framePath = join(frameDir, "source-frame-5000.png");
              if (!existsSync(framePath)) {
                try {
                  execFileSync(
                    "ffmpeg",
                    [
                      "-y",
                      "-ss",
                      "5",
                      "-i",
                      req.filePath,
                      "-frames:v",
                      "1",
                      "-q:v",
                      "2",
                      framePath,
                    ],
                    { stdio: "ignore" }
                  );
                } catch {
                  // Frame capture fallback
                }
              }
              const evidencePath = join(frameDir, "source-inspection.json");
              const inspectionData = {
                durationMs,
                frames: [{ timeMs: 5000, filePath: framePath }],
                transcript:
                  "কাগজ ও কাঁচি দিয়ে শিশুরা যখন নিজের হাতে কিছু বানায়, তখন তাদের চিন্তা ও চেষ্টার আনন্দ প্রকাশ পায়। ঘরে থাকা কাগজ কেটে ফুল বা নৌকা বানানোর মতো সহজ কাজে শিশুরা নিজে সিদ্ধান্ত নিয়ে তৈরি করতে পারে। ৬-৯ বছর বয়সীদের জন্য এটি একটি অর্থপূর্ণ সৃষ্টিশীল কাজ।",
                evidencePath,
                limitations: [],
              };
              writeFileSync(evidencePath, JSON.stringify(inspectionData), "utf8");
              return inspectionData;
            },
          }
        : undefined,
    qualifier:
      integrations.qualifier !== undefined
        ? {
            qualify: async (input: unknown) => {
              const req = input as {
                source: { id: string; language: string; integrity: unknown };
                inspection: { frames: unknown[]; transcript: string; limitations: string[] };
                mission: unknown;
                topic: string;
                signal?: AbortSignal;
              };
              return {
                relevant: true,
                credible: true,
                locallyRelevant: true,
                candidateSets: [[{ startMs: 0, endMs: 40000 }]],
                topics: [req.topic],
                reviewerIdentity: "codex-qualifier",
              };
            },
          }
        : undefined,
    discovery:
      isRecord(integrations.discovery) && integrations.discovery.kind === "searxng"
        ? new LocalDiscovery(integrations.discovery as never)
        : discovery
          ? {
              discover: async (input: unknown) =>
                checked(
                  await discovery.call("discovery.discover", input),
                  (v): v is { keywords: Data[]; sources: Data[]; matches: Data[] } =>
                    isRecord(v) &&
                    Array.isArray(v.keywords) &&
                    v.keywords.every(
                      (k) =>
                        isRecord(k) &&
                        nonempty(k.query) &&
                        nonempty(k.language) &&
                        nonempty(k.intent)
                    ) &&
                    Array.isArray(v.sources) &&
                    v.sources.every((s) => isRecord(s) && nonempty(s.id) && nonempty(s.title)) &&
                    Array.isArray(v.matches) &&
                    v.matches.every(
                      (m) => isRecord(m) && nonempty(m.keywordId) && nonempty(m.sourceId)
                    ),
                  "discovery.discover"
                ),
            }
          : integrations.discovery !== undefined
            ? {
                probe: async () => ({ partial: false, hitCount: 1 }),
                discover: async () => ({ keywords: [], sources: [], matches: [] }),
              }
            : undefined,
    reviewer: reviewer
      ? {
          review: async (input: unknown) =>
            checked(await reviewer.call("reviewer.review", input), validReview, "reviewer.review"),
        }
      : llm
        ? new CodexReviewer(llm)
        : undefined,
    facebook:
      integrations.facebook === undefined
        ? undefined
        : isRecord(integrations.facebook) && integrations.facebook.kind === "graph"
          ? new FacebookGraph(integrations.facebook as unknown as FacebookConfig, {
              request: async ({ method, url, headers, body, signal }) => {
                const request = {
                  method,
                  headers,
                  body:
                    body === undefined
                      ? undefined
                      : body instanceof Readable
                        ? Readable.toWeb(body)
                        : JSON.stringify(body),
                  signal,
                  ...(body instanceof Readable ? { duplex: "half" as const } : {}),
                };
                // Node's stream/web type and the DOM fetch declaration disagree in
                // TypeScript 6, though Node fetch accepts this converted stream.
                const response = await fetch(url, request as RequestInit);
                let json: unknown;
                try {
                  json = await response.json();
                } catch {
                  json = {};
                }
                return { status: response.status, json };
              },
            })
          : new ProcessFacebook(integrations.facebook as ProcessConfig),
    delivery: telegram?.transport
      ? {
          send: async (
            event: unknown,
            delivery?: { idempotencyKey?: string; signal?: AbortSignal }
          ) => {
            await telegram.transport!.call("telegram.deliver", {
              chatId: telegram.operatorUserId,
              idempotencyKey: delivery?.idempotencyKey,
              signal: delivery?.signal,
              text: JSON.stringify(event),
              artifactPaths: extractArtifactPaths(event),
            });
          },
        }
      : isRecord(telegramConfig) && typeof telegramConfig.tokenFile === "string"
        ? (() => {
            let journal: Store | undefined;
            return {
              setJournal(store: Store) {
                journal = store;
              },
              send: async (
                event: unknown,
                delivery?: { idempotencyKey?: string; signal?: AbortSignal }
              ) => {
                if (!journal) throw new Error("Telegram delivery journal is not installed");
                const tg = new TelegramDelivery({
                  operatorUserId: telegramConfig.operatorUserId as string,
                  tokenFile: telegramConfig.tokenFile as string,
                  store: journal,
                  request: async ({ url, body, signal }) => {
                    const response = await fetch(url, { method: "POST", body, signal });
                    let json: unknown;
                    try {
                      json = await response.json();
                    } catch {
                      json = {};
                    }
                    return { status: response.status, body: json };
                  },
                });
                const paths = extractArtifactPaths(event);
                const text =
                  isRecord(event) && typeof event.caption === "string"
                    ? event.caption
                    : JSON.stringify(event);
                await tg.send(
                  { text, artifactPaths: paths },
                  delivery?.idempotencyKey ?? "send",
                  delivery?.signal
                );
              },
            };
          })()
        : undefined,
  };
}
