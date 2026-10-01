import { describe, it, expect } from "vitest";
import { dueReminder } from "@/lib/clubs/trial-reminders";

const now = new Date("2026-10-10T15:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3600_000);

describe("dueReminder", () => {
  it("nothing when more than 3 days remain", () => {
    expect(dueReminder(inHours(24 * 3 + 1), [], now)).toBeNull();
  });
  it("d3 within 3 days", () => {
    expect(dueReminder(inHours(60), [], now)).toBe("d3");
  });
  it("d1 within 1 day, even if d3 was never sent", () => {
    expect(dueReminder(inHours(20), [], now)).toBe("d1");
    expect(dueReminder(inHours(20), ["d3"], now)).toBe("d1");
  });
  it("d0 once the trial has ended", () => {
    expect(dueReminder(inHours(-1), ["d3", "d1"], now)).toBe("d0");
  });
  it("never repeats a sent key", () => {
    expect(dueReminder(inHours(60), ["d3"], now)).toBeNull();
    expect(dueReminder(inHours(-1), ["d0"], now)).toBeNull();
  });
  it("stops after the trial is long over (no late spam)", () => {
    expect(dueReminder(inHours(-24 * 8), [], now)).toBeNull();
  });
});
