import { fileIntegrity } from "../../domain.ts";
export function inspectMediaFixture(input: {
  filePath: string;
  kind: "text" | "image" | "video";
  probe?: {
    durationSeconds?: number;
    width?: number;
    height?: number;
    audio?: { intelligible?: boolean; coverage?: string; meanDb?: number };
    frames?: Array<{ filePath: string; timeMs: number }>;
    transcript?: string;
    coverage?: string;
    limitations?: string;
  };
}) {
  const integrity = fileIntegrity(input.filePath);
  if (input.kind === "text")
    return {
      valid: true,
      evidence: {
        text: "read independently",
        inputHash: integrity.sha256,
        tools: ["node-read"],
        inspectedAt: new Date().toISOString(),
        limitations: "text fixture",
      },
    };
  const probe = input.probe;
  const evidence = {
    frames: probe?.frames ?? [],
    transcript: probe?.transcript ?? "",
    audio: probe?.audio,
    coverage: probe?.coverage,
    limitations: probe?.limitations ?? "inspection incomplete",
    inputHash: integrity.sha256,
    tools: ["ffprobe", "ffmpeg-decode", "whisper"],
    inspectedAt: new Date().toISOString(),
  };
  const valid =
    input.kind === "image"
      ? evidence.frames.length > 0
      : !!probe &&
        probe.durationSeconds! >= 30 &&
        probe.durationSeconds! <= 60 &&
        probe.width! > 0 &&
        Math.abs(probe.width! / probe.height! - 9 / 16) < 0.015 &&
        evidence.frames.length > 0 &&
        !!evidence.transcript.trim() &&
        evidence.audio?.intelligible === true &&
        !!evidence.audio.coverage &&
        !!evidence.coverage &&
        !!evidence.limitations;
  return {
    valid,
    durationSeconds: probe?.durationSeconds,
    width: probe?.width,
    height: probe?.height,
    evidence,
  };
}
