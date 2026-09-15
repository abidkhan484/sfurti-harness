import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { AdapterError } from "../process.ts";

export interface LocalRunOptions {
  executable: string;
  args: string[];
  cwd: string;
  outputRoot: string;
  env?: Record<string, string>;
  deadlineMs: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
}
export interface LocalRunResult {
  stdout: string;
  stderr: string;
  code: number;
}
function inside(root: string, path: string) {
  const rel = relative(root, path);
  return !!rel && !rel.startsWith("..") && !rel.includes(".." + sep);
}

/** Argument-only native execution; it never inherits ambient credential-bearing process environment. */
export async function runLocalTool(options: LocalRunOptions): Promise<LocalRunResult> {
  if (
    !options.executable ||
    !Array.isArray(options.args) ||
    options.args.some((arg) => typeof arg !== "string")
  )
    throw new AdapterError("configuration", "Local tool requires an executable and argument array");
  if (!Number.isSafeInteger(options.deadlineMs) || options.deadlineMs <= 0)
    throw new AdapterError("configuration", "Local tool requires a positive deadline");
  const root = resolve(options.outputRoot);
  mkdirSync(root, { recursive: true });
  if (!inside(root, resolve(options.cwd)) && resolve(options.cwd) !== root)
    throw new AdapterError(
      "configuration",
      "Local tool working directory must be inside its task root"
    );
  if (options.signal?.aborted)
    throw new AdapterError("timeout", "Local tool cancelled before launch");
  return new Promise((resolveResult, reject) => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      shell: false,
      detached: process.platform !== "win32",
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let done = false,
      bytes = 0,
      stdout = "",
      stderr = "";
    const limit = options.maxOutputBytes ?? 1_048_576;
    const stop = () => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* exited */
      }
    };
    const finish = (error?: AdapterError, result?: LocalRunResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) {
        stop();
        reject(error);
      } else resolveResult(result!);
    };
    const abort = () => finish(new AdapterError("timeout", "Local tool cancelled", false));
    const timer = setTimeout(
      () => finish(new AdapterError("timeout", "Local tool deadline exceeded", false)),
      options.deadlineMs
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    const collect = (stream: "stdout" | "stderr", chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit)
        return finish(
          new AdapterError("output_limit", "Local tool output exceeded its bound", false)
        );
      if (stream === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.on("error", () => finish(new AdapterError("unavailable", "Local tool could not start")));
    child.on("close", (code) => {
      if (done) return;
      if (code !== 0)
        return finish(new AdapterError("transient", "Local tool exited unsuccessfully", false));
      finish(undefined, { stdout, stderr, code: code ?? 0 });
    });
  });
}
