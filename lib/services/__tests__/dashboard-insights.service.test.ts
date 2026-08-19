import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/client.service", () => ({ getClientsForTrainer: vi.fn() }));

import {
  computeProgramWeek,
  computeSessionStreak,
  computeCompletionRate,
  computeVarianceBreakdown,
  countSessionsDueToday,
  getLastActivityAt,
  getLastCompletedAt,
  buildPriorityAlerts,
  countClientsNeedingAttention,
  type ClientSessionSummary,
  type ClientSnapshot,
} from "../dashboard-insights.service";

const NOW = new Date("2026-07-14T12:00:00Z");
const DAY = 1000 * 60 * 60 * 24;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY);

function session(overrides: Partial<ClientSessionSummary>): ClientSessionSummary {
  return {
    status: "SCHEDULED",
    scheduledDate: NOW,
    completedAt: null,
    startedAt: null,
    scheduleVariance: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<ClientSnapshot>): ClientSnapshot {
  return {
    clientId: "c1",
    clientName: "Jane Doe",
    sessions: [],
    activeProgram: null,
    recentFeedback: [],
    ...overrides,
  };
}

describe("computeProgramWeek", () => {
  it("returns null when start date or duration is missing", () => {
    expect(computeProgramWeek(null, NOW)).toBeNull();
    expect(computeProgramWeek({ name: "P", startDate: null, durationWeeks: 12 }, NOW)).toBeNull();
    expect(computeProgramWeek({ name: "P", startDate: daysAgo(7), durationWeeks: null }, NOW)).toBeNull();
  });

  it("computes the current week from elapsed time (1-indexed)", () => {
    expect(computeProgramWeek({ name: "P", startDate: daysAgo(14), durationWeeks: 12 }, NOW)).toEqual({
      current: 3,
      total: 12,
    });
  });

  it("clamps the current week to the total duration", () => {
    expect(computeProgramWeek({ name: "P", startDate: daysAgo(200), durationWeeks: 12 }, NOW)).toEqual({
      current: 12,
      total: 12,
    });
  });

  it("returns week 1 for a program that has not started yet", () => {
    expect(computeProgramWeek({ name: "P", startDate: daysAhead(3), durationWeeks: 8 }, NOW)).toEqual({
      current: 1,
      total: 8,
    });
  });
});

describe("computeSessionStreak", () => {
  it("counts consecutive completed scheduled sessions from most recent", () => {
    const sessions = [
      session({ status: "COMPLETED", scheduledDate: daysAgo(2), completedAt: daysAgo(2) }),
      session({ status: "COMPLETED", scheduledDate: daysAgo(4), completedAt: daysAgo(4) }),
      session({ status: "MISSED", scheduledDate: daysAgo(6) }),
      session({ status: "COMPLETED", scheduledDate: daysAgo(8), completedAt: daysAgo(8) }),
    ];
    expect(computeSessionStreak(sessions, NOW)).toBe(2);
  });

  it("ignores future sessions and stops at the first non-completed", () => {
    const sessions = [
      session({ status: "SCHEDULED", scheduledDate: daysAhead(1) }),
      session({ status: "MISSED", scheduledDate: daysAgo(1) }),
      session({ status: "COMPLETED", scheduledDate: daysAgo(3), completedAt: daysAgo(3) }),
    ];
    expect(computeSessionStreak(sessions, NOW)).toBe(0);
  });
});

describe("computeCompletionRate", () => {
  it("returns rate and scheduled count within the trailing window", () => {
    const sessions = [
      session({ status: "COMPLETED", scheduledDate: daysAgo(1) }),
      session({ status: "MISSED", scheduledDate: daysAgo(3) }),
      session({ status: "COMPLETED", scheduledDate: daysAgo(5) }),
      session({ status: "COMPLETED", scheduledDate: daysAgo(30) }), // outside 14d window
    ];
    expect(computeCompletionRate(sessions, NOW)).toEqual({ rate: 2 / 3, scheduled: 3 });
  });

  it("returns zero when nothing is scheduled in the window", () => {
    expect(computeCompletionRate([], NOW)).toEqual({ rate: 0, scheduled: 0 });
  });
});

describe("computeVarianceBreakdown", () => {
  it("splits completed sessions in the window by scheduleVariance and counts missed separately", () => {
    const sessions = [
      session({ status: "COMPLETED", scheduledDate: daysAgo(1), scheduleVariance: "ON_TIME" }),
      session({ status: "COMPLETED", scheduledDate: daysAgo(2), scheduleVariance: "EARLY" }),
      session({ status: "COMPLETED", scheduledDate: daysAgo(3), scheduleVariance: "DELAYED" }),
      session({ status: "MISSED", scheduledDate: daysAgo(4) }),
      session({ status: "SCHEDULED", scheduledDate: daysAgo(5) }), // not yet resolved, ignored
    ];
    expect(computeVarianceBreakdown(sessions, NOW)).toEqual({
      onTime: 1,
      early: 1,
      delayed: 1,
      missed: 1,
    });
  });

  it("treats a completed session with no scheduleVariance as on-time (legacy/unbackfilled data)", () => {
    const sessions = [session({ status: "COMPLETED", scheduledDate: daysAgo(1), scheduleVariance: null })];
    expect(computeVarianceBreakdown(sessions, NOW)).toEqual({ onTime: 1, early: 0, delayed: 0, missed: 0 });
  });

  it("excludes sessions outside the trailing window", () => {
    const sessions = [session({ status: "COMPLETED", scheduledDate: daysAgo(30), scheduleVariance: "DELAYED" })];
    expect(computeVarianceBreakdown(sessions, NOW)).toEqual({ onTime: 0, early: 0, delayed: 0, missed: 0 });
  });
});

describe("countSessionsDueToday", () => {
  it("counts only today's scheduled or in-progress sessions", () => {
    const snapshots = [
      snapshot({
        sessions: [
          session({ status: "SCHEDULED", scheduledDate: NOW }),
          session({ status: "IN_PROGRESS", scheduledDate: NOW }),
          session({ status: "COMPLETED", scheduledDate: NOW }), // not due
          session({ status: "SCHEDULED", scheduledDate: daysAhead(1) }), // not today
        ],
      }),
    ];
    expect(countSessionsDueToday(snapshots, NOW)).toBe(2);
  });
});

describe("getLastActivityAt / getLastCompletedAt", () => {
  it("returns the most recent activity timestamp, preferring completedAt over startedAt", () => {
    const sessions = [
      session({ status: "IN_PROGRESS", startedAt: daysAgo(1) }),
      session({ status: "COMPLETED", completedAt: daysAgo(3) }),
    ];
    expect(getLastActivityAt(sessions)).toEqual(daysAgo(1));
    expect(getLastCompletedAt(sessions)).toEqual(daysAgo(3));
  });

  it("returns null when there is no activity", () => {
    expect(getLastActivityAt([session({})])).toBeNull();
    expect(getLastCompletedAt([session({})])).toBeNull();
  });
});

describe("buildPriorityAlerts", () => {
  const activeProgram = { name: "Knee Rehab", startDate: daysAgo(7), durationWeeks: 12 };

  it("flags recent pain feedback as high severity", () => {
    const alerts = buildPriorityAlerts(
      [snapshot({ recentFeedback: [{ rating: "PAINFUL", createdAt: daysAgo(1) }] })],
      NOW
    );
    expect(alerts.some((a) => a.severity === "high" && /pain/i.test(a.message))).toBe(true);
  });

  it("flags inactivity beyond the threshold as high severity, only with an active program", () => {
    const withProgram = buildPriorityAlerts(
      [
        snapshot({
          activeProgram,
          sessions: [session({ status: "COMPLETED", scheduledDate: daysAgo(6), completedAt: daysAgo(6) })],
        }),
      ],
      NOW
    );
    expect(withProgram.some((a) => a.severity === "high" && /inactive/i.test(a.message))).toBe(true);

    const noProgram = buildPriorityAlerts(
      [
        snapshot({
          activeProgram: null,
          sessions: [session({ status: "COMPLETED", scheduledDate: daysAgo(6), completedAt: daysAgo(6) })],
        }),
      ],
      NOW
    );
    expect(noProgram).toHaveLength(0);
  });

  it("flags a client with an active program but no activity as high severity", () => {
    const alerts = buildPriorityAlerts([snapshot({ activeProgram, sessions: [] })], NOW);
    expect(alerts.some((a) => a.severity === "high" && /hasn't started/i.test(a.message))).toBe(true);
  });

  it("does not flag 'hasn't started' when the program's start date is in the future", () => {
    const futureProgram = { name: "Knee Rehab", startDate: daysAhead(3), durationWeeks: 12 };
    const alerts = buildPriorityAlerts([snapshot({ activeProgram: futureProgram, sessions: [] })], NOW);
    expect(alerts.some((a) => /hasn't started/i.test(a.message))).toBe(false);
  });

  it("flags low completion and program ending soon as medium severity", () => {
    const endingProgram = { name: "P", startDate: daysAgo(11 * 7), durationWeeks: 12 };
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          clientId: "c2",
          activeProgram: endingProgram,
          sessions: [
            session({ status: "COMPLETED", scheduledDate: daysAgo(2), completedAt: daysAgo(2) }),
            session({ status: "MISSED", scheduledDate: daysAgo(4) }),
            session({ status: "MISSED", scheduledDate: daysAgo(6) }),
          ],
        }),
      ],
      NOW
    );
    expect(alerts.some((a) => a.severity === "medium" && /%/.test(a.message))).toBe(true);
    expect(alerts.some((a) => a.severity === "medium" && /ends in/i.test(a.message))).toBe(true);
  });

  it("flags a majority-delayed completion pattern as medium severity", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          sessions: [
            session({ status: "COMPLETED", scheduledDate: daysAgo(1), scheduleVariance: "DELAYED" }),
            session({ status: "COMPLETED", scheduledDate: daysAgo(3), scheduleVariance: "DELAYED" }),
            session({ status: "COMPLETED", scheduledDate: daysAgo(5), scheduleVariance: "ON_TIME" }),
          ],
        }),
      ],
      NOW
    );
    expect(alerts.some((a) => a.severity === "medium" && /after their scheduled date/i.test(a.message))).toBe(true);
  });

  it("does not flag a delayed pattern when on-time/early sessions are the majority", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          sessions: [
            session({ status: "COMPLETED", scheduledDate: daysAgo(1), scheduleVariance: "DELAYED" }),
            session({ status: "COMPLETED", scheduledDate: daysAgo(3), scheduleVariance: "ON_TIME" }),
            session({ status: "COMPLETED", scheduledDate: daysAgo(5), scheduleVariance: "EARLY" }),
          ],
        }),
      ],
      NOW
    );
    expect(alerts.some((a) => /after their scheduled date/i.test(a.message))).toBe(false);
  });

  it("does not flag a delayed pattern from a single delayed session (below the minimum count)", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          sessions: [session({ status: "COMPLETED", scheduledDate: daysAgo(1), scheduleVariance: "DELAYED" })],
        }),
      ],
      NOW
    );
    expect(alerts.some((a) => /after their scheduled date/i.test(a.message))).toBe(false);
  });

  it("flags perfect completion as low severity", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          sessions: [
            session({ status: "COMPLETED", scheduledDate: daysAgo(2), completedAt: daysAgo(2) }),
            session({ status: "COMPLETED", scheduledDate: daysAgo(4), completedAt: daysAgo(4) }),
          ],
        }),
      ],
      NOW
    );
    expect(alerts.some((a) => a.severity === "low" && /every scheduled workout/i.test(a.message))).toBe(true);
  });

  it("sorts alerts by severity (high first)", () => {
    const alerts = buildPriorityAlerts(
      [
        snapshot({
          clientId: "c3",
          activeProgram,
          recentFeedback: [{ rating: "PAINFUL", createdAt: daysAgo(1) }],
          sessions: [
            session({ status: "COMPLETED", scheduledDate: daysAgo(2), completedAt: daysAgo(2) }),
            session({ status: "COMPLETED", scheduledDate: daysAgo(4), completedAt: daysAgo(4) }),
          ],
        }),
      ],
      NOW
    );
    const ranks = alerts.map((a) => a.severity);
    expect(ranks[0]).toBe("high");
  });
});

describe("countClientsNeedingAttention", () => {
  it("counts distinct clients with high or medium alerts, excluding low-only clients", () => {
    const alerts = [
      { clientId: "a", clientName: "A", severity: "high" as const, message: "", href: "" },
      { clientId: "a", clientName: "A", severity: "medium" as const, message: "", href: "" },
      { clientId: "b", clientName: "B", severity: "low" as const, message: "", href: "" },
      { clientId: "c", clientName: "C", severity: "medium" as const, message: "", href: "" },
    ];
    expect(countClientsNeedingAttention(alerts)).toBe(2);
  });
});
