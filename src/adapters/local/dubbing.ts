import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type VoiceReceipt = {
  voiceId: "bn_BD-google-medium";
  speaker: number;
  modelSha256: string;
  configSha256: string;
  approved: boolean;
  checkedAt: string;
};
export function assertDubbingEligible(input: {
  source: { language: string; permission: { scope: string[] }; transcript?: string };
  translation?: { bangla: string; reviewed: boolean };
  receipt?: VoiceReceipt;
  modelPath: string;
  configPath: string;
}) {
  if (input.source.language === "bn") return { required: false };
  if (!input.source.permission.scope.includes("translate"))
    throw new Error("Foreign source requires translate scope");
  if (
    !input.source.transcript?.trim() ||
    !input.translation?.reviewed ||
    !/[\u0980-\u09ff]/u.test(input.translation.bangla)
  )
    throw new Error("Foreign source requires reviewed Bangla translation and preserved transcript");
  const receipt = input.receipt;
  if (
    !receipt?.approved ||
    receipt.voiceId !== "bn_BD-google-medium" ||
    !Number.isInteger(receipt.speaker) ||
    receipt.speaker < 0 ||
    receipt.speaker > 15
  )
    throw new Error(
      "Bangla dubbing remains unavailable until a valid listener-quality receipt exists"
    );
  if (
    hash(input.modelPath) !== receipt.modelSha256 ||
    hash(input.configPath) !== receipt.configSha256
  )
    throw new Error("Pinned Piper model or config integrity changed");
  return {
    required: true,
    normalizedText: normalizeBanglaNumbers(input.translation.bangla),
    speaker: receipt.speaker,
  };
}
export function normalizeBanglaNumbers(value: string) {
  return value.replace(/\d+/g, (digits) =>
    [...digits].map((d) => "০১২৩৪৫৬৭৮৯"[Number(d)]).join("")
  );
}
function hash(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
