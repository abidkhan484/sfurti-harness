import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export interface Config {
  timezone: string;
  topic: string;
  daily: { videos: number; images: number; texts: number; productionTimes: string[] };
  audience: { language: string; minAge: number; maxAge: number; segments: string[] };
  video: {
    format: string;
    aspectRatio: string;
    minSeconds: number;
    maxSeconds: number;
    preferOriginalBangla: boolean;
    allowBanglaDubbing: boolean;
  };
  review: {
    automaticApproval: boolean;
    maxIterations: number;
    initialRenderCountsAsIteration: boolean;
  };
  llm: {
    taskModels: Record<string, { provider: string; model: string }>;
    /** Present only for the opt-in Pi profile. It deliberately has no API-key mode. */
    billingMode?: "chatgpt-only";
  };
  storage: { databasePath: string; mediaDirectory: string; backupDirectory?: string };
  posting: {
    windowsFile: string;
    windows?: { start: string; end: string }[];
    minSpacingMinutes: number | null;
    queueCsvPath: string;
    [key: string]: unknown;
  };
  reserve: { minimumDays: number; continueAboveMinimum: boolean };
  custom: { scheduleByDefault: boolean };
  productionMode: "legacy" | "evidence";
  research: {
    enabled: boolean;
    languages: string[];
    queriesPerRun: number;
    resultsPerQuery: number;
    newDocumentsPerDay: number;
    requestsPerHostPerMinute: number;
    concurrentFetches: number;
    maxDocumentBytes: number;
    httpTimeoutMs: number;
    browserContexts: number;
    browserPagesPerDay: number;
    briefsPerTopicRevision: number;
    cadence: {
      discoveryHours: number;
      sourceCheckHours: number;
      broaderSearchDays: number;
      reviewDays: number;
    };
  };
  content: {
    totalPostsPerDay: number;
    mixWindow: number;
    weights: { text: number; image: number; video: number };
  };
  memory: {
    enabled: boolean;
    baseUrl: string | null;
    apiTokenEnv: string | null;
    datasets: string[];
  };
  tts: {
    executable: string | null;
    voiceId: string | null;
    modelPath: string | null;
    configPath: string | null;
  };
  renderer: { executable: string | null; fontPath: string | null };
  browser: { enabled: boolean; storageStatePath: string | null; allowedOrigins: string[] };
  limits: {
    concurrency: number;
    maxTasksPerTick: number;
    maxTasksPerDay: number;
    taskTimeoutMs: number;
    leaseMs: number;
    backoffMs: number;
    minFreeBytes: number;
    tickMs: number;
  };
  integrations?: Record<string, unknown>;
  setup?: { verifiedSample?: string; verifiedAt?: string };
  deployment?: PiFreeDeployment;
}

export interface PiFreeDeployment {
  profile: "pi-free";
  executionMode: "preview" | "live";
  intake: { path: string; scanSeconds: number; maxVideoBytes: number; maxVideoMinutes: number };
  localTools: {
    paths: Record<string, string>;
    manifestPath: string;
    maxNativeThreads: number;
    heavyTaskConcurrency: number;
    stageDeadlinesMs: { codex: number; render: number; asr: number };
  };
  search: {
    endpoint: string;
    queriesPerBatch: number;
    resultsPerQuery: number;
    maxRecommendationsPerTopic: number;
    minRequestSpacingMs: number;
    concurrency: number;
  };
  storageBudget: { minFreeBytes: number; managedCeilingBytes: number };
  setupReceiptPolicy: { connectionMaxAgeDays: number; requireRealReceipts: boolean };
  delivery: { enabled: boolean };
  codexAuthDirectory: string;
}
const defaults: Config = {
  timezone: "Asia/Dhaka",
  topic: "Unintentional screen time and meaningful alternatives for children",
  daily: { videos: 3, images: 1, texts: 1, productionTimes: ["06:00", "07:00", "08:00"] },
  audience: {
    language: "bn",
    minAge: 3,
    maxAge: 15,
    segments: ["general", "3-5", "6-9", "10-12", "13-15"],
  },
  video: {
    format: "reel",
    aspectRatio: "9:16",
    minSeconds: 30,
    maxSeconds: 60,
    preferOriginalBangla: true,
    allowBanglaDubbing: true,
  },
  review: { automaticApproval: true, maxIterations: 3, initialRenderCountsAsIteration: true },
  llm: { taskModels: {} },
  storage: { databasePath: "./data/sfurti.sqlite", mediaDirectory: "./data/media" },
  posting: {
    windowsFile: "./config/posting-windows.json",
    minSpacingMinutes: null,
    queueCsvPath: "./data/exports/upload-queue.csv",
  },
  reserve: { minimumDays: 90, continueAboveMinimum: true },
  custom: { scheduleByDefault: false },
  productionMode: "legacy",
  research: {
    enabled: false,
    languages: ["bn", "en"],
    queriesPerRun: 12,
    resultsPerQuery: 10,
    newDocumentsPerDay: 50,
    requestsPerHostPerMinute: 2,
    concurrentFetches: 2,
    maxDocumentBytes: 15 * 1024 * 1024,
    httpTimeoutMs: 30000,
    browserContexts: 1,
    browserPagesPerDay: 20,
    briefsPerTopicRevision: 3,
    cadence: { discoveryHours: 24, sourceCheckHours: 24, broaderSearchDays: 7, reviewDays: 30 },
  },
  content: { totalPostsPerDay: 5, mixWindow: 20, weights: { text: 0.1, image: 0.25, video: 0.65 } },
  memory: {
    enabled: false,
    baseUrl: null,
    apiTokenEnv: null,
    datasets: ["audience", "evidence", "approved_claim", "editorial_history"],
  },
  tts: { executable: null, voiceId: null, modelPath: null, configPath: null },
  renderer: { executable: null, fontPath: null },
  browser: { enabled: false, storageStatePath: null, allowedOrigins: [] },
  limits: {
    concurrency: 1,
    maxTasksPerTick: 5,
    maxTasksPerDay: 20,
    taskTimeoutMs: 120000,
    leaseMs: 180000,
    backoffMs: 60000,
    minFreeBytes: 104857600,
    tickMs: 30000,
  },
};

const gib = 1024 * 1024 * 1024;
const piFreeDefaults: PiFreeDeployment = {
  profile: "pi-free",
  executionMode: "preview",
  intake: { path: "./data/inbox", scanSeconds: 60, maxVideoBytes: 2 * gib, maxVideoMinutes: 60 },
  localTools: {
    paths: { ffmpeg: "ffmpeg", ffprobe: "ffprobe", chromium: "chromium", whisper: "whisper-cli" },
    manifestPath: "./config/pi-tool-manifest.json",
    maxNativeThreads: 2,
    heavyTaskConcurrency: 1,
    stageDeadlinesMs: { codex: 5 * 60_000, render: 30 * 60_000, asr: 60 * 60_000 },
  },
  search: {
    endpoint: "http://searxng:8080",
    queriesPerBatch: 3,
    resultsPerQuery: 10,
    maxRecommendationsPerTopic: 5,
    minRequestSpacingMs: 1000,
    concurrency: 1,
  },
  storageBudget: { minFreeBytes: 8 * gib, managedCeilingBytes: 32 * gib },
  setupReceiptPolicy: { connectionMaxAgeDays: 7, requireRealReceipts: true },
  delivery: { enabled: false },
  codexAuthDirectory: "./data/private/codex",
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function merge(base: unknown, input: unknown): unknown {
  const result = structuredClone(base);
  if (!isRecord(result) || !isRecord(input)) return input;
  const baseRecord = isRecord(base) ? base : {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = isRecord(value) ? merge(baseRecord[key] ?? {}, value) : value;
  }
  return result;
}
export function loadConfig(
  input: Partial<Config> | Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env
): Config {
  const fromFile = env.SFURTI_CONFIG ? JSON.parse(readFileSync(env.SFURTI_CONFIG, "utf8")) : {};
  const supplied = merge(fromFile, input) as Record<string, unknown>;
  const piRequested = isRecord(supplied.deployment) && supplied.deployment.profile === "pi-free";
  const config = merge(
    piRequested
      ? merge(defaults, { deployment: piFreeDefaults, llm: { billingMode: "chatgpt-only" } })
      : defaults,
    supplied
  ) as Config;
  const overrides = {
    DAILY_VIDEO_COUNT: "videos",
    DAILY_IMAGE_COUNT: "images",
    DAILY_TEXT_COUNT: "texts",
  } as const;
  for (const [name, key] of Object.entries(overrides)) {
    const raw = env[name];
    if (raw !== undefined) {
      if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a nonnegative integer`);
      config.daily[key] = Number(raw);
    }
  }
  // Collect all constraint violations before throwing so the caller sees every issue at once.
  const violations: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (condition) violations.push(message);
  };
  for (const key of ["videos", "images", "texts"] as const)
    check(
      !Number.isSafeInteger(config.daily[key]) || config.daily[key] < 0,
      `daily.${key} must be a nonnegative integer`
    );
  check(
    config.timezone !== "Asia/Dhaka",
    "timezone must be Asia/Dhaka for this single-context harness"
  );
  if (config.deployment !== undefined) {
    const d = config.deployment;
    check(d.profile !== "pi-free", "deployment.profile must be pi-free");
    check(!["preview", "live"].includes(d.executionMode), "deployment.executionMode is invalid");
    check(config.llm.billingMode !== "chatgpt-only", "Pi deployment requires ChatGPT-only billing");
    check(
      config.productionMode !== "legacy" || config.research.enabled !== false,
      "Pi profile preserves legacy production with research disabled"
    );
    check(
      config.daily.videos !== 3 || config.daily.images !== 1 || config.daily.texts !== 1,
      "Pi profile requires the daily 3 videos, 1 image, 1 text target"
    );
    check(config.reserve.minimumDays !== 90, "Pi profile requires a 90-day reserve target");
    const positive = (value: unknown) => !Number.isSafeInteger(value) || Number(value) <= 0;
    check(
      !d.intake ||
        typeof d.intake.path !== "string" ||
        !d.intake.path ||
        positive(d.intake.scanSeconds) ||
        positive(d.intake.maxVideoBytes) ||
        positive(d.intake.maxVideoMinutes),
      "Pi intake settings are invalid"
    );
    check(
      !d.localTools ||
        typeof d.localTools.manifestPath !== "string" ||
        !d.localTools.manifestPath ||
        !isRecord(d.localTools.paths) ||
        Object.values(d.localTools.paths).some((p) => typeof p !== "string" || !p) ||
        positive(d.localTools.maxNativeThreads) ||
        positive(d.localTools.heavyTaskConcurrency),
      "Pi local tool settings are invalid"
    );
    check(
      !d.localTools ||
        !isRecord(d.localTools.stageDeadlinesMs) ||
        Object.values(d.localTools.stageDeadlinesMs).some(positive),
      "Pi stage deadlines are invalid"
    );
    check(
      !d.search ||
        !/^https?:\/\//.test(d.search.endpoint) ||
        [
          d.search.queriesPerBatch,
          d.search.resultsPerQuery,
          d.search.maxRecommendationsPerTopic,
          d.search.minRequestSpacingMs,
          d.search.concurrency,
        ].some(positive),
      "Pi search settings are invalid"
    );
    check(
      !d.storageBudget ||
        positive(d.storageBudget.minFreeBytes) ||
        positive(d.storageBudget.managedCeilingBytes) ||
        d.storageBudget.managedCeilingBytes <= d.storageBudget.minFreeBytes,
      "Pi storage budget is invalid"
    );
    check(
      !d.setupReceiptPolicy ||
        positive(d.setupReceiptPolicy.connectionMaxAgeDays) ||
        typeof d.setupReceiptPolicy.requireRealReceipts !== "boolean",
      "Pi setup receipt policy is invalid"
    );
    check(
      !d.delivery || typeof d.delivery.enabled !== "boolean",
      "Pi delivery settings are invalid"
    );
    check(
      typeof d.codexAuthDirectory !== "string" || !d.codexAuthDirectory,
      "Pi Codex auth directory is required"
    );
    const integrations = config.integrations ?? {};
    check(
      Object.values(integrations).some(
        (value) =>
          isRecord(value) && ("apiKey" in value || "apiKeyEnv" in value || value.auth === "api-key")
      ),
      "Pi deployment rejects API-key integration authentication"
    );
  }
  check(typeof config.topic !== "string" || !config.topic.trim(), "topic must be nonempty");
  check(
    config.audience.language !== "bn" ||
      !Array.isArray(config.audience.segments) ||
      !config.audience.segments.length ||
      config.audience.segments.some((x) => typeof x !== "string" || !x.trim()),
    "Bangla audience and nonempty age segments are required"
  );
  check(
    config.audience.minAge !== 3 || config.audience.maxAge !== 15,
    "Audience must preserve the agreed ages 3–15"
  );
  check(
    config.review.maxIterations !== 3 ||
      !config.review.initialRenderCountsAsIteration ||
      !config.review.automaticApproval,
    "Review requires three total versions with automatic approval only after passing"
  );
  check(
    config.video.aspectRatio !== "9:16" ||
      config.video.minSeconds < 30 ||
      config.video.maxSeconds > 60 ||
      config.video.minSeconds > config.video.maxSeconds,
    "Reels must be vertical and 30–60 seconds"
  );
  check(config.custom.scheduleByDefault !== false, "Custom scheduling requires explicit intent");
  check(
    !config.llm || typeof config.llm !== "object" || Array.isArray(config.llm),
    "llm must contain taskModels"
  );
  check(
    "provider" in (config.llm as Record<string, unknown>),
    "llm.provider is no longer supported; configure llm.taskModels.<taskType>.provider and .model explicitly"
  );
  check(
    !config.llm.taskModels ||
      typeof config.llm.taskModels !== "object" ||
      Array.isArray(config.llm.taskModels),
    "llm.taskModels must be an object"
  );
  for (const [taskType, assignment] of Object.entries(config.llm.taskModels ?? {}))
    check(
      !["search", "topic-validation", "generation", "review"].includes(taskType) ||
        !assignment ||
        typeof assignment !== "object" ||
        !isRecord(assignment) ||
        typeof assignment.provider !== "string" ||
        !assignment.provider.trim() ||
        typeof assignment.model !== "string" ||
        !assignment.model.trim(),
      `llm.taskModels.${taskType} requires a nonempty provider and model`
    );
  check(
    !Number.isSafeInteger(config.reserve.minimumDays) ||
      config.reserve.minimumDays < 90 ||
      config.reserve.continueAboveMinimum !== true,
    "Planning floor must be at least 90 days and permit continued generation"
  );
  check(
    !Array.isArray(config.daily.productionTimes) ||
      config.daily.productionTimes.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)),
    "Invalid daily production time"
  );
  for (const [key, value] of Object.entries(config.limits))
    check(
      !Number.isSafeInteger(value) || (value as number) <= 0,
      `limits.${key} must be a positive integer`
    );
  check(config.limits.leaseMs <= config.limits.taskTimeoutMs, "Lease must outlive task timeout");
  check(
    !["legacy", "evidence"].includes(config.productionMode),
    "productionMode must be legacy or evidence"
  );
  for (const [key, value] of Object.entries(config.research)) {
    if (key === "enabled" || key === "languages" || key === "cadence") continue;
    check(
      !Number.isSafeInteger(value) || (value as number) <= 0,
      `research.${key} must be a positive integer`
    );
  }
  check(
    !Array.isArray(config.research.languages) ||
      !config.research.languages.length ||
      config.research.languages.some(
        (language) => typeof language !== "string" || !language.trim()
      ),
    "research.languages must be nonempty language identifiers"
  );
  for (const [key, value] of Object.entries(config.research.cadence))
    check(
      !Number.isSafeInteger(value) || (value as number) <= 0,
      `research.cadence.${key} must be a positive integer`
    );
  const weightTotal =
    config.content.weights.text + config.content.weights.image + config.content.weights.video;
  check(Math.abs(weightTotal - 1) > 0.000001, "content.weights must sum to 1");
  check(
    !Number.isSafeInteger(config.content.totalPostsPerDay) || config.content.totalPostsPerDay < 1,
    "content.totalPostsPerDay must be a positive integer"
  );
  check(
    !Number.isSafeInteger(config.content.mixWindow) ||
      config.content.mixWindow < config.content.totalPostsPerDay,
    "content.mixWindow must be at least totalPostsPerDay"
  );
  check(
    config.memory.enabled &&
      (!config.memory.baseUrl || !/^https?:\/\//.test(config.memory.baseUrl)),
    "memory.baseUrl must be an HTTP base when memory is enabled"
  );
  check(
    config.browser.enabled && !config.browser.storageStatePath,
    "browser.storageStatePath is required when browser is enabled"
  );
  check(
    config.productionMode === "evidence" && !config.research.enabled,
    "Evidence productionMode requires research.enabled"
  );
  check(
    config.posting.minSpacingMinutes !== null &&
      (!Number.isFinite(config.posting.minSpacingMinutes) ||
        (config.posting.minSpacingMinutes as number) <= 0),
    "Posting spacing must be positive or null until setup"
  );
  for (const path of [
    config.storage.databasePath,
    config.storage.mediaDirectory,
    config.posting.queueCsvPath,
    config.posting.windowsFile,
  ])
    check(typeof path !== "string" || !path, "Storage and posting paths must be nonempty");
  if (violations.length) throw new Error(violations.join("\n"));
  // Paths are project-root relative, matching the documented configuration contract.
  config.storage.databasePath = resolve(config.storage.databasePath);
  config.storage.mediaDirectory = resolve(config.storage.mediaDirectory);
  config.posting.queueCsvPath = resolve(config.posting.queueCsvPath);
  config.posting.windowsFile = resolve(config.posting.windowsFile);
  if (config.deployment) {
    config.deployment.intake.path = resolve(config.deployment.intake.path);
    config.deployment.localTools.manifestPath = resolve(config.deployment.localTools.manifestPath);
    config.deployment.codexAuthDirectory = resolve(config.deployment.codexAuthDirectory);
  }
  if (
    config.storage.databasePath === config.posting.queueCsvPath ||
    dirname(config.storage.databasePath) === config.storage.databasePath
  )
    throw new Error("Database and CSV paths must be distinct files");
  return config;
}
