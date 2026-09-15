import { readFileSync } from "node:fs";

export interface PostingWindows {
  timezone: "Asia/Dhaka";
  windows: { start: string; end: string }[];
  evidence: string[];
  researchedAt: string;
  limitations: string;
}
const time = (v: unknown) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minute = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
/** The one canonical parser used by planning and doctor; it never researches or invents evidence. */
export function parsePostingWindows(value: unknown, spacing: unknown): PostingWindows {
  if (!Number.isSafeInteger(spacing) || Number(spacing) <= 0)
    throw new Error("Posting spacing must be a positive whole number of minutes");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Saved posting windows are required");
  const v = value as Record<string, unknown>;
  if (
    v.timezone !== "Asia/Dhaka" ||
    !Array.isArray(v.windows) ||
    !v.windows.length ||
    !Array.isArray(v.evidence) ||
    !v.evidence.length ||
    typeof v.researchedAt !== "string" ||
    !Number.isFinite(Date.parse(v.researchedAt)) ||
    typeof v.limitations !== "string" ||
    !v.limitations.trim()
  )
    throw new Error("Posting windows require Asia/Dhaka, evidence, research date and limitations");
  const windows = v.windows
    .map((w) => {
      const item = w as Record<string, unknown> | null | undefined;
      const start = typeof item?.start === "string" ? item.start : "";
      const end = typeof item?.end === "string" ? item.end : "";
      if (
        !w ||
        typeof w !== "object" ||
        Array.isArray(w) ||
        !time(start) ||
        !time(end) ||
        minute(end) <= minute(start)
      )
        throw new Error("Posting windows must be non-empty same-day HH:MM ranges");
      return { start, end };
    })
    .sort((a, b) => minute(a.start) - minute(b.start));
  for (let i = 1; i < windows.length; i++)
    if (minute(windows[i].start) <= minute(windows[i - 1].end))
      throw new Error("Posting windows may not overlap");
  if ((v.evidence as unknown[]).some((e) => typeof e !== "string" || !e.trim()))
    throw new Error("Posting evidence must be nonempty");
  return {
    timezone: "Asia/Dhaka",
    windows,
    evidence: v.evidence as string[],
    researchedAt: v.researchedAt,
    limitations: v.limitations,
  };
}
export function loadPostingWindows(file: string, inline: unknown, spacing: unknown) {
  return parsePostingWindows(inline ?? JSON.parse(readFileSync(file, "utf8")), spacing);
}
export function postingMinutes(input: PostingWindows) {
  const all: number[] = [];
  for (const w of input.windows) for (let n = minute(w.start); n <= minute(w.end); n++) all.push(n);
  return all;
}
export const postingWindowsExample = {
  timezone: "Asia/Dhaka",
  windows: [
    { start: "09:00", end: "13:00" },
    { start: "17:00", end: "21:00" },
  ],
  evidence: ["operator-provided Page observation or cited public timing source"],
  researchedAt: "2026-09-15T00:00:00.000Z",
  limitations:
    "Provisional Bangladesh-audience setup evidence; 60-minute spacing is a policy, not an optimal-engagement claim.",
};
