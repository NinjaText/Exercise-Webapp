import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  computeCompletion,
  computePainSummary,
  filterPainPointsByWeeks,
  pickRecentActivity,
  type ProgressSession,
  type PainPoint,
} from "../client-progress.service";

const NOW = new Date("2026-09-15T12:00:00Z");
const DAY = 1000 * 60 * 60 * 24;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function s(status: string, daysBack: number, name = "Workout"): ProgressSession {
  return {
    status,
    scheduledDate: daysAgo(daysBack),
    completedAt: status === "COMPLETED" ? daysAgo(daysBack) : null,
    workoutName: name,
  };
}

describe("computeCompletion", () => {
  it("counts completed over scheduled and rounds the percentage", () => {
    const current = [s("COMPLETED", 3), s("COMPLETED", 2), s("MISSED", 1)];
    const result = computeCompletion(current, []);
    expect(result.completed).toBe(2);
    expect(result.scheduled).toBe(3);
    expect(result.percent).toBe(67);
  });

  it("reports the percentage-point change against the previous period", () => {
    const current = [s("COMPLETED", 3), s("COMPLETED", 2)];          // 100%
    const previous = [s("COMPLETED", 20), s("MISSED", 19)];          // 50%
    expect(computeCompletion(current, previous).changeVsPrevious).toBe(50);
  });

  it("returns a null change when there is no previous data", () => {
    expect(computeCompletion([s("COMPLETED", 1)], []).changeVsPrevious).toBeNull();
  });

  it("returns zeroes rather than NaN for an empty period", () => {
    const result = computeCompletion([], []);
    expect(result).toEqual({ completed: 0, scheduled: 0, percent: 0, changeVsPrevious: null });
  });
});

describe("computePainSummary", () => {
  const points: PainPoint[] = [
    { value: 7, recordedAt: daysAgo(28) },
    { value: 5, recordedAt: daysAgo(14) },
    { value: 2, recordedAt: daysAgo(1) },
  ];

  it("takes the earliest point as baseline and the latest as current", () => {
    const result = computePainSummary(points);
    expect(result.baseline).toBe(7);
    expect(result.latest).toBe(2);
  });

  it("computes the percent change from baseline to latest", () => {
    expect(computePainSummary(points).percentChange).toBe(-71);
  });

  it("is order-independent", () => {
    const shuffled = [points[2], points[0], points[1]];
    expect(computePainSummary(shuffled).baseline).toBe(7);
    expect(computePainSummary(shuffled).latest).toBe(2);
  });

  it("returns nulls when there are no points", () => {
    expect(computePainSummary([])).toEqual({ baseline: null, latest: null, percentChange: null });
  });

  it("returns a null percentChange for a single point", () => {
    const one = [{ value: 4, recordedAt: daysAgo(1) }];
    expect(computePainSummary(one)).toEqual({ baseline: 4, latest: 4, percentChange: null });
  });

  it("returns a null percentChange when the baseline is zero", () => {
    const fromZero = [
      { value: 0, recordedAt: daysAgo(10) },
      { value: 3, recordedAt: daysAgo(1) },
    ];
    expect(computePainSummary(fromZero).percentChange).toBeNull();
  });
});

describe("filterPainPointsByWeeks", () => {
  it("keeps only points inside the window", () => {
    const points: PainPoint[] = [
      { value: 8, recordedAt: daysAgo(60) },
      { value: 5, recordedAt: daysAgo(10) },
    ];
    expect(filterPainPointsByWeeks(points, 4, NOW)).toHaveLength(1);
    expect(filterPainPointsByWeeks(points, 12, NOW)).toHaveLength(2);
  });
});

describe("pickRecentActivity", () => {
  it("returns completed and missed sessions, newest first, capped at the limit", () => {
    const sessions = [s("COMPLETED", 5), s("MISSED", 1), s("SCHEDULED", 0), s("COMPLETED", 3)];
    const recent = pickRecentActivity(sessions, 3);
    expect(recent).toHaveLength(3);
    expect(recent[0].scheduledDate).toEqual(daysAgo(1));
    expect(recent.some((r) => r.status === "SCHEDULED")).toBe(false);
  });
});
