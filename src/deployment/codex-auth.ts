import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

/** A tiny in-process lock plus generation fence for the single Pi process. */
const locks = new Map<string, Promise<void>>();
async function locked<T>(path: string, body: () => Promise<T>): Promise<T> {
  const before = locks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    path,
    before.then(() => next)
  );
  await before;
  try {
    return await body();
  } finally {
    release();
    if (locks.get(path) === next) locks.delete(path);
  }
}
export async function withIsolatedCodexAuth<T>(
  authFile: string,
  taskHome: string,
  body: () => Promise<T>
): Promise<T> {
  await mkdir(taskHome, { recursive: true, mode: 0o700 });
  const taskAuth = join(taskHome, "auth.json");
  await locked(authFile, async () => {
    try {
      await copyFile(authFile, taskAuth);
    } catch {
      /* login/probe reports missing auth later */
    }
  });
  const original = await fingerprint(taskAuth);
  try {
    return await body();
  } finally {
    const refreshed = await fingerprint(taskAuth);
    if (refreshed && refreshed !== original)
      await locked(authFile, async () => {
        // Last writer wins only after taking the cache lock; a stale task cannot overwrite a newer cache.
        const current = await fingerprint(authFile);
        if (current === original || !current) {
          await mkdir(dirname(authFile), { recursive: true, mode: 0o700 });
          const staged = `${authFile}.${randomUUID()}.tmp`;
          await copyFile(taskAuth, staged);
          await writeFile(staged, await readFile(staged), { mode: 0o600 });
          await rename(staged, authFile);
        }
      });
  }
}
async function fingerprint(path: string): Promise<string | null> {
  try {
    const value = await readFile(path);
    const s = await stat(path);
    return `${s.size}:${createHash("sha256").update(value).digest("hex")}`;
  } catch {
    return null;
  }
}
export function codexAuthReceipt(authDirectory: string, model: string) {
  return {
    target: "codex",
    kind: "inference",
    identityFingerprint: createHash("sha256").update(authDirectory).digest("hex"),
    model,
    capabilities: ["text", "images"],
    authentication: "chatgpt-session",
  };
}
export async function removeTaskHome(path: string) {
  await rm(path, { recursive: true, force: true });
}
