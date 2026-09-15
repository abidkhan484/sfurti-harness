import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** Token files are resolved only by a concrete transport immediately before its network call. */
export interface SecretFileReference {
  tokenFile: string;
}

export function resolveSecretFile(reference: unknown, name = "secret"): string {
  const candidate =
    reference && typeof reference === "object" && !Array.isArray(reference)
      ? (reference as Record<string, unknown>).tokenFile
      : undefined;
  if (typeof candidate !== "string" || !candidate.trim())
    throw new Error(`${name} requires a private tokenFile reference`);
  const path = resolve(candidate);
  try {
    if (!statSync(path).isFile()) throw new Error("not a file");
    const token = readFileSync(path, "utf8").trim();
    if (!token) throw new Error("empty");
    return token;
  } catch {
    throw new Error(`${name} token file is unreadable`);
  }
}

/** Remove values rather than attempting to mask a fragment that may be copied elsewhere. */
export function redactSecrets(value: unknown, sentinels: string[] = []): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const secret of sentinels) if (secret) result = result.split(secret).join("[REDACTED]");
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, sentinels));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /token|secret|authorization|api.?key/i.test(key)
          ? "[REDACTED]"
          : redactSecrets(item, sentinels),
      ])
    );
  return value;
}
