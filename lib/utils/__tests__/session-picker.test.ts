import { describe, it, expect } from "vitest";
import { pickStartableSession } from "../session-picker";

// Real scheduledDate values are UTC-midnight-anchored (see lib/utils/calendar-date.ts),
// so the fixtures must be too — otherwise this suite fails in UTC+13/+14, where a
// UTC-noon instant already belongs to the next local day.
const NOW = new Date(2026, 8, 15, 12, 0, 0); // local noon, 15 Sep 2026
const utcDay = (offsetDays: number) => new Date(Date.UTC(2026, 8, 15 + offsetDays));

function session(over: Record<string, unknown>) {
  return { id: "s1", scheduledDate: utcDay(0), status: "SCHEDULED", ...over };
}

describe("pickStartableSession", () => {
  it("returns today's scheduled session when one exists", () => {
    const today = session({ id: "today", scheduledDate: utcDay(0) });
    const later = session({ id: "later", scheduledDate: utcDay(2) });
    expect(pickStartableSession([later, today], NOW)?.id).toBe("today");
  });

  it("falls back to the soonest future session", () => {
    const soon = session({ id: "soon", scheduledDate: utcDay(1) });
    const far = session({ id: "far", scheduledDate: utcDay(5) });
    expect(pickStartableSession([far, soon], NOW)?.id).toBe("soon");
  });

  it("ignores completed sessions", () => {
    const done = session({ id: "done", scheduledDate: utcDay(0), status: "COMPLETED" });
    expect(pickStartableSession([done], NOW)).toBeNull();
  });

  it("ignores missed sessions", () => {
    const missed = session({ id: "missed", scheduledDate: utcDay(0), status: "MISSED" });
    expect(pickStartableSession([missed], NOW)).toBeNull();
  });

  it("ignores past sessions that were never completed", () => {
    const past = session({ id: "past", scheduledDate: utcDay(-3) });
    expect(pickStartableSession([past], NOW)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickStartableSession([], NOW)).toBeNull();
  });
});
