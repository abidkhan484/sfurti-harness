import { createHash } from "node:crypto";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runLocalTool } from "./runner.ts";

/** Formats milliseconds as ASS subtitle clock: h:mm:ss.cs (centiseconds). */
export function assTimestamp(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const cs = Math.floor((ms % 1_000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const escape = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[x]!
  );
/** Local, asset-free UTF-8 text/image rendering with an immutable sidecar manifest. */
export class LocalEditor {
  private readonly config: { chromium: string; fontPath: string; deadlineMs: number };
  constructor(config: { chromium: string; fontPath: string; deadlineMs: number }) {
    this.config = config;
  }
  async create(input: {
    artifact: { kind: "text" | "image"; id: string };
    outputDirectory: string;
    idempotencyKey: string;
    bodyBn: string;
    captionBn: string;
    attribution?: string | null;
    signal?: AbortSignal;
  }) {
    if (!/[\u0980-\u09ff]/u.test(input.bodyBn) || input.bodyBn.length > 3000)
      throw new Error("Bangla body must be bounded");
    const base = input.artifact.kind === "text" ? "artifact.txt" : "artifact.png";
    const output = join(input.outputDirectory, base);
    const manifest = join(input.outputDirectory, "manifest.json");
    if (existsSync(output) && existsSync(manifest))
      return { filePath: output, caption: input.captionBn };
    if (input.artifact.kind === "text") writeFileSync(output, input.bodyBn, "utf8");
    else {
      const html = join(input.outputDirectory, "render.html");
      const temporary = `${output}.partial`;
      writeFileSync(
        html,
        `<meta charset="utf-8"><style>@font-face{font-family:Bangla;src:url('file://${escape(this.config.fontPath)}')}*{box-sizing:border-box}body{margin:0;width:1080px;height:1080px;padding:90px;background:#f7f2e8;color:#172b20;font-family:Bangla,sans-serif;overflow:hidden}h1{font-size:64px;line-height:1.25}p{font-size:36px;line-height:1.45}.mark{position:absolute;bottom:70px}</style><h1>${escape(input.bodyBn)}</h1><p>${escape(input.attribution ?? "")}</p><div class="mark">Sfurti</div>`,
        "utf8"
      );
      await runLocalTool({
        executable: this.config.chromium,
        args: [
          "--headless",
          "--disable-gpu",
          "--no-first-run",
          `--screenshot=${temporary}`,
          "--window-size=1080,1080",
          `file://${html}`,
        ],
        cwd: input.outputDirectory,
        outputRoot: input.outputDirectory,
        deadlineMs: this.config.deadlineMs,
        signal: input.signal,
      });
      if (!existsSync(temporary)) throw new Error("Chromium did not produce image output");
      renameSync(temporary, output);
    }
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          body: input.bodyBn,
          caption: input.captionBn,
          attribution: input.attribution,
          kind: input.artifact.kind,
        })
      )
      .digest("hex");
    writeFileSync(
      manifest,
      JSON.stringify({
        artifactId: input.artifact.id,
        idempotencyKey: input.idempotencyKey,
        inputHash,
        tool: input.artifact.kind === "image" ? this.config.chromium : "node",
        fontPath: this.config.fontPath,
      }),
      "utf8"
    );
    return { filePath: output, caption: input.captionBn };
  }
}

/** FFmpeg-only clip renderer: no downloads, music, synthetic filler, or segment rewriting. */
export class LocalClipEditor {
  private readonly config: {
    ffmpeg: string;
    fontPath: string;
    deadlineMs: number;
    threads: number;
  };
  constructor(config: { ffmpeg: string; fontPath: string; deadlineMs: number; threads: number }) {
    this.config = config;
  }
  async create(input: {
    sourcePath: string;
    segments: Array<{ startMs: number; endMs: number }>;
    outputDirectory: string;
    idempotencyKey: string;
    caption: string;
    subtitles: Array<{ startMs: number; endMs: number; textBn: string }>;
    signal?: AbortSignal;
  }) {
    // Current implementation renders exactly one contiguous source segment.
    // Multi-segment concatenation is a known future improvement (spec allows non-overlapping sets).
    const duration = input.segments.reduce((sum, s) => sum + s.endMs - s.startMs, 0);
    if (duration < 30_000 || duration > 60_000 || input.segments.length !== 1)
      throw new Error(
        "Clip requires one exact 30–60 second allocated interval (single segment only)"
      );
    const output = join(input.outputDirectory, "artifact.mp4"),
      manifest = join(input.outputDirectory, "manifest.json");
    if (existsSync(output) && existsSync(manifest))
      return { filePath: output, caption: input.caption, segments: input.segments };
    const segment = input.segments[0],
      subtitle = join(input.outputDirectory, "captions.ass");
    writeFileSync(
      subtitle,
      `[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,Alignment,MarginV\nStyle: Default,${this.config.fontPath.replace(/[,\\]/g, "")},42,&H00FFFFFF,2,120\n[Events]\nFormat: Layer,Start,End,Style,Text\n${input.subtitles.map((s) => `Dialogue: 0,${assTimestamp(s.startMs)},${assTimestamp(s.endMs)},Default,${s.textBn.replace(/[{}\\]/g, "")}`).join("\n")}`,
      "utf8"
    );
    const partial = `${output}.partial`;
    await runLocalTool({
      executable: this.config.ffmpeg,
      args: [
        "-y",
        "-ss",
        String(segment.startMs / 1000),
        "-t",
        String(duration / 1000),
        "-i",
        input.sourcePath,
        "-vf",
        `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,subtitles=${subtitle}`,
        "-c:v",
        "libx264",
        "-threads",
        String(Math.min(2, this.config.threads)),
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        partial,
      ],
      cwd: input.outputDirectory,
      outputRoot: input.outputDirectory,
      deadlineMs: this.config.deadlineMs,
      signal: input.signal,
    });
    if (!existsSync(partial)) throw new Error("FFmpeg did not produce clip output");
    renameSync(partial, output);
    writeFileSync(
      manifest,
      JSON.stringify({
        idempotencyKey: input.idempotencyKey,
        sourcePath: input.sourcePath,
        segments: input.segments,
        outputHash: createHash("sha256")
          .update(input.sourcePath + JSON.stringify(input.segments))
          .digest("hex"),
        codec: "h264/aac",
        fontPath: this.config.fontPath,
      }),
      "utf8"
    );
    return { filePath: output, caption: input.caption, segments: input.segments };
  }
}
