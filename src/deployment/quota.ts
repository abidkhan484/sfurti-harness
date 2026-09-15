import type { Store } from "../store.ts";
import { AdapterError } from "../adapters/process.ts";

const initialDelayMs = 5 * 60_000,
  maxDelayMs = 6 * 60 * 60_000;
export function classifyCodexFailure(error: unknown): "quota" | "authentication" | "transient" {
  const value = error instanceof AdapterError ? `${error.kind}:${error.message}` : String(error);
  if (/rate.?limit|quota|allowance|429/i.test(value)) return "quota";
  if (/auth|401|403|login/i.test(value)) return "authentication";
  return "transient";
}
type TaskState = { id: string; attempt?: number; stage?: string; [key: string]: unknown };
export function deferQuotaTask(
  store: Store,
  input: {
    taskId: string;
    role: string;
    provider: string;
    model: string;
    sessionRef: string | null;
    now: Date;
    resetAt?: string | null;
  }
) {
  const current = store.get<TaskState>("tasks", input.taskId);
  const attempt = Number(current?.attempt ?? 0) + 1;
  const explicit =
    input.resetAt && Number.isFinite(Date.parse(input.resetAt)) ? Date.parse(input.resetAt) : null;
  const delay = Math.min(maxDelayMs, initialDelayMs * 2 ** Math.max(0, attempt - 1));
  const nextRunAt = new Date(
    explicit && explicit > input.now.getTime() ? explicit : input.now.getTime() + delay
  ).toISOString();
  const record = {
    ...current,
    id: input.taskId,
    taskId: input.taskId,
    stage: current?.stage ?? "llm",
    status: "deferred",
    attempt,
    provider: input.provider,
    model: input.model,
    role: input.role,
    sessionRef: input.sessionRef,
    quotaScope: `codex:${input.provider}`,
    nextRunAt,
    leaseOwner: null,
    leaseUntil: input.now.toISOString(),
    errorCode: "quota",
  };
  store.put("tasks", record);
  store.put("meta", {
    id: record.quotaScope,
    until: nextRunAt,
    updatedAt: input.now.toISOString(),
  });
  return record;
}
export function quotaBlocked(store: Store, provider: string, now: Date) {
  const until = store.get<{ until?: unknown }>("meta", `codex:${provider}`)?.until;
  return typeof until === "string" && Date.parse(until) > now.getTime();
}
