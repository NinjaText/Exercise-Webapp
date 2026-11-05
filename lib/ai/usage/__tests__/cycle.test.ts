import { describe, it, expect } from "vitest";
import { addMonthsUTC, computeCycleWindow } from "../cycle";

const d = (iso: string) => new Date(iso);

describe("computeCycleWindow", () => {
  it("falls back to the UTC calendar month without period info", () => {
    const w = computeCycleWindow(null, d("2026-11-05T12:00:00Z"));
    expect(w).toEqual({ start: d("2026-11-01T00:00:00Z"), end: d("2026-12-01T00:00:00Z"), source: "calendar" });
    expect(computeCycleWindow({ currentPeriodEnd: null }, d("2026-11-05T12:00:00Z")).source).toBe("calendar");
  });

  it("uses [periodEnd − 1 month, periodEnd) for a Stripe-backed subscription", () => {
    const w = computeCycleWindow({ currentPeriodEnd: d("2026-11-20T09:00:00Z") }, d("2026-11-05T12:00:00Z"));
    expect(w).toEqual({ start: d("2026-10-20T09:00:00Z"), end: d("2026-11-20T09:00:00Z"), source: "subscription" });
  });

  it("rolls a stale period end forward until the window contains now", () => {
    const w = computeCycleWindow({ currentPeriodEnd: d("2026-09-20T09:00:00Z") }, d("2026-11-25T00:00:00Z"));
    expect(w.start).toEqual(d("2026-11-20T09:00:00Z"));
    expect(w.end).toEqual(d("2026-12-20T09:00:00Z"));
  });

  it("rolls a far-future (annual) period end back to the monthly window containing now", () => {
    const w = computeCycleWindow({ currentPeriodEnd: d("2027-06-15T00:00:00Z") }, d("2026-11-05T00:00:00Z"));
    expect(w.start).toEqual(d("2026-10-15T00:00:00Z"));
    expect(w.end).toEqual(d("2026-11-15T00:00:00Z"));
  });

  it("is stable across the whole cycle (same key) and starts a new one at the boundary", () => {
    const sub = { currentPeriodEnd: d("2026-11-20T09:00:00Z") };
    const a = computeCycleWindow(sub, d("2026-10-20T09:00:00Z"));
    const b = computeCycleWindow(sub, d("2026-11-20T08:59:59Z"));
    expect(a.start).toEqual(b.start);
    const next = computeCycleWindow(sub, d("2026-11-20T09:00:00Z"));
    expect(next.start).toEqual(d("2026-11-20T09:00:00Z"));
  });

  it("clamps month-end anchors without drifting the billing day", () => {
    expect(addMonthsUTC(d("2027-01-31T00:00:00Z"), 1)).toEqual(d("2027-02-28T00:00:00Z"));
    const w = computeCycleWindow({ currentPeriodEnd: d("2027-01-31T00:00:00Z") }, d("2027-03-05T00:00:00Z"));
    expect(w.start).toEqual(d("2027-02-28T00:00:00Z"));
    expect(w.end).toEqual(d("2027-03-31T00:00:00Z"));
  });
});
