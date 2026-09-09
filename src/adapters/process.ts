import { StringDecoder } from "node:string_decoder";
import { spawn } from "node:child_process";

export type ErrorKind =
  | "configuration"
  | "timeout"
  | "output_limit"
  | "protocol"
  | "unavailable"
  | "rate_limit"
  | "authentication"
  | "rejected"
  | "transient";
export class AdapterError extends Error {
  kind: ErrorKind;
  code: ErrorKind;
  uncertain: boolean;
  retryAfterMs?: number;
  constructor(kind: ErrorKind, message: string, uncertain = false, retryAfterMs?: number) {
    super(message);
    this.name = "AdapterError";
    this.kind = kind;
    this.code = kind;
    this.uncertain = uncertain;
    this.retryAfterMs = retryAfterMs;
  }
}
export interface ProcessConfig {
  executable: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
}
export interface OperationAdapter {
  call(operation: string, payload: unknown): Promise<unknown>;
}

/** One request and one response per process. Credentials stay in explicitly configured env. */
export class ProcessAdapter implements OperationAdapter {
  config: ProcessConfig;
  constructor(config: ProcessConfig) {
    if (
      !config ||
      typeof config.executable !== "string" ||
      !config.executable.trim() ||
      (config.args !== undefined &&
        (!Array.isArray(config.args) || config.args.some((a) => typeof a !== "string"))) ||
      (config.timeoutMs !== undefined &&
        (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0)) ||
      (config.maxOutputBytes !== undefined &&
        (!Number.isSafeInteger(config.maxOutputBytes) || config.maxOutputBytes <= 0))
    ) {
      throw new AdapterError(
        "configuration",
        "External adapter requires an executable and positive bounded limits"
      );
    }
    this.config = config;
  }
  async call(operation: string, payload: unknown): Promise<unknown> {
    let signal: AbortSignal | undefined;
    if (isRecord(payload) && payload.signal instanceof AbortSignal) {
      const { signal: requestSignal, ...data } = payload;
      signal = requestSignal;
      payload = data;
    }
    if (signal?.aborted)
      throw new AdapterError("timeout", "External operation cancelled before launch");
    const input = JSON.stringify({ protocol: "sfurti/1", operation, payload }) + "\n";
    const limit = this.config.maxOutputBytes ?? 1_048_576;
    if (Buffer.byteLength(input) > limit)
      throw new AdapterError("protocol", "Adapter request exceeds configured size limit");
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.executable, this.config.args ?? [], {
        cwd: this.config.cwd,
        shell: false,
        detached: process.platform !== "win32",
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8", ...this.config.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let finished = false,
        bytes = 0,
        output = "";
      const decoder = new StringDecoder("utf8");
      const stop = () => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          /* Already exited. */
        }
      };
      const fail = (error: AdapterError) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        stop();
        reject(error);
      };
      const onAbort = () =>
        fail(
          new AdapterError(
            "timeout",
            "External operation cancelled; reconcile side effects before retrying",
            true
          )
        );
      const timer = setTimeout(
        () =>
          fail(
            new AdapterError(
              "timeout",
              "External adapter timed out; reconcile side effects before retrying",
              true
            )
          ),
        this.config.timeoutMs ?? 120_000
      );
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      const count = (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > limit)
          fail(
            new AdapterError(
              "output_limit",
              "External adapter exceeded output limit; reconcile side effects before retrying",
              true
            )
          );
      };
      child.stdout.on("data", (chunk: Buffer) => {
        count(chunk);
        if (!finished) output += decoder.write(chunk);
      });
      child.stderr.on("data", count); // Never expose raw provider logs or secrets in application errors.
      child.on("error", () =>
        fail(new AdapterError("unavailable", "External adapter could not start"))
      );
      child.stdin.on("error", () =>
        fail(new AdapterError("transient", "External adapter closed its input unexpectedly", true))
      );
      child.on("close", (code) => {
        if (finished) return;
        clearTimeout(timer);
        output += decoder.end();
        stop();
        if (code !== 0)
          return fail(
            new AdapterError(
              "transient",
              "External adapter exited unsuccessfully; reconcile side effects before retrying",
              true
            )
          );
        let response: unknown;
        try {
          response = JSON.parse(output);
        } catch {
          return fail(new AdapterError("protocol", "External adapter returned invalid JSON", true));
        }
        if (
          !isRecord(response) ||
          response.protocol !== "sfurti/1" ||
          typeof response.ok !== "boolean"
        )
          return fail(
            new AdapterError("protocol", "External adapter returned an invalid envelope", true)
          );
        if (response.ok) {
          if (!("result" in response))
            return fail(new AdapterError("protocol", "External adapter omitted its result", true));
          finished = true;
          signal?.removeEventListener("abort", onAbort);
          resolve(response.result);
          return;
        }
        const error = isRecord(response.error) ? response.error : {};
        const kinds: ErrorKind[] = ["rate_limit", "authentication", "rejected", "transient"];
        const kind = kinds.includes(error.kind as ErrorKind)
          ? (error.kind as ErrorKind)
          : "protocol";
        fail(
          new AdapterError(
            kind,
            `External adapter failed: ${kind}`,
            error.uncertain !== false,
            typeof error.retryAfterMs === "number" && error.retryAfterMs >= 0
              ? error.retryAfterMs
              : undefined
          )
        );
      });
      child.stdin.end(input);
    });
  }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
