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
  llm: { taskModels: Record<string, { provider: string; model: string }> };
  storage: { databasePath: string; mediaDirectory: string; backupDirectory?: string };
  posting: {
    windowsFile: string;
    windows?: { start: string; end: string }[];
    minSpacingMinutes: number | null;
    queueCsvPath: string;
    [key: string]: any;
  };
  reserve: { minimumDays: number; continueAboveMinimum: boolean };
  custom: { scheduleByDefault: boolean };
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
  integrations?: Record<string, any>;
  setup?: { verifiedSample?: string; verifiedAt?: string };
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
function merge(base: any, input: any): any {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(input ?? {})) {
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(base?.[key] ?? {}, value)
        : value;
  }
  return result;
}
export function loadConfig(
  input: Partial<Config> | Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env
): Config {
  const fromFile = env.SFURTI_CONFIG ? JSON.parse(readFileSync(env.SFURTI_CONFIG, "utf8")) : {};
  const config: Config = merge(merge(defaults, fromFile), input);
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
      !["generation", "review"].includes(taskType) ||
        !assignment ||
        typeof assignment !== "object" ||
        typeof (assignment as any).provider !== "string" ||
        !(assignment as any).provider.trim() ||
        typeof (assignment as any).model !== "string" ||
        !(assignment as any).model.trim(),
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
  if (
    config.storage.databasePath === config.posting.queueCsvPath ||
    dirname(config.storage.databasePath) === config.storage.databasePath
  )
    throw new Error("Database and CSV paths must be distinct files");
  return config;
}
