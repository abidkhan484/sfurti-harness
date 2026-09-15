import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
export type ToolManifest = {
  schemaVersion: 1;
  architecture: "arm64";
  tools: Record<string, { version: string; sha256?: string; license: string }>;
  whisper: { model: "small"; sha256: string; bytes: number; source: string };
};
export function loadToolManifest(path: string): ToolManifest {
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Tool manifest must be an object");
  const value = data as ToolManifest;
  if (
    value.schemaVersion !== 1 ||
    value.architecture !== "arm64" ||
    value.whisper?.model !== "small" ||
    !/^[a-f0-9]{64}$/i.test(value.whisper?.sha256 ?? "") ||
    !Number.isSafeInteger(value.whisper?.bytes) ||
    value.whisper.bytes <= 0 ||
    !/^https:/.test(value.whisper?.source ?? "")
  )
    throw new Error("Tool manifest is incomplete, wrong architecture, or has invalid Whisper pin");
  for (const required of ["ffmpeg", "ffprobe", "chromium", "noto-sans-bengali", "whisper-cli"]) {
    const tool = value.tools?.[required];
    if (!tool || !tool.version || !tool.license) throw new Error(`Tool manifest omits ${required}`);
  }
  return value;
}
export function toolManifestHash(manifest: ToolManifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}
