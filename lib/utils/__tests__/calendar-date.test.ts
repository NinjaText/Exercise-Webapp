import { describe, it, expect } from "vitest";
import { toLocalCalendarDate, toUtcCalendarDate } from "../calendar-date";

describe("toLocalCalendarDate", () => {
  it("maps a UTC-midnight-anchored date to the same calendar day locally", () => {
    const persisted = new Date(Date.UTC(2026, 8, 20));
    const local = toLocalCalendarDate(persisted);
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(8);
    expect(local.getDate()).toBe(20);
  });

  it("is NOT safe to apply to an already-local date — the guard behind the drag-reschedule fix", () => {
    // react-big-calendar hands an all-day drop back as LOCAL midnight. Feeding that
    // through toLocalCalendarDate (which reads UTC components) shifts it a day east of UTC.
    // This test documents WHY program-schedule-view must not convert `overrideDate`.
    const droppedLocal = new Date(2026, 8, 20, 0, 0, 0);
    const roundTripped = toUtcCalendarDate(droppedLocal);
    expect(roundTripped.getUTCDate()).toBe(20);
  });
});
