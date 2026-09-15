import assert from "node:assert/strict";
import test from "node:test";
import { parsePostingWindows, postingMinutes } from "../src/deployment/posting-windows.ts";

const valid = {
  timezone: "Asia/Dhaka",
  windows: [
    { start: "09:00", end: "13:00" },
    { start: "17:00", end: "21:00" },
  ],
  evidence: ["operator observation"],
  researchedAt: "2026-09-15T00:00:00Z",
  limitations: "Provisional; spacing is policy.",
};
test("Pi posting windows reject timezone, evidence, overlap and cannot fabricate capacity", () => {
  assert.equal(postingMinutes(parsePostingWindows(valid, 60)).length > 300, true);
  assert.throws(() => parsePostingWindows({ ...valid, timezone: "UTC" }, 60), /Asia/);
  assert.throws(() => parsePostingWindows({ ...valid, evidence: [] }, 60), /evidence/);
  assert.throws(
    () =>
      parsePostingWindows(
        {
          ...valid,
          windows: [
            { start: "09:00", end: "11:00" },
            { start: "10:00", end: "12:00" },
          ],
        },
        60
      ),
    /overlap/
  );
});
