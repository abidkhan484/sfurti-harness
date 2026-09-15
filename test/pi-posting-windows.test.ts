import assert from "node:assert/strict";
import test from "node:test";
import {
  availablePostingCapacity,
  parsePostingWindows,
  postingMinutes,
} from "../src/deployment/posting-windows.ts";

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
test("capacity includes existing schedules and late-day elapsed windows", () => {
  const input = parsePostingWindows(
    { ...valid, windows: [{ start: "09:00", end: "13:00" }] },
    60
  );
  assert.equal(
    availablePostingCapacity(input, {
      date: "2026-09-15",
      spacingMinutes: 60,
      now: new Date("2026-09-15T08:30:00+06:00"),
      occupiedAt: ["2026-09-15T10:00:00+06:00"],
    }),
    4
  );
  assert.equal(
    availablePostingCapacity(input, {
      date: "2026-09-15",
      spacingMinutes: 60,
      now: new Date("2026-09-15T12:05:00+06:00"),
    }),
    1
  );
});
