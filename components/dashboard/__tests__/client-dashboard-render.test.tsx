import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays } from "date-fns";
import { ClientDashboard } from "../client-dashboard";

/**
 * Static-render smoke test for the client dashboard's "Up next" states.
 *
 * The controller can't sign in as a CLIENT-role user in this environment, so
 * this exercises the three mutually-exclusive branches (today's workout /
 * future session / nothing scheduled) directly against a minimal fixture,
 * without a browser. `ClientDashboard` is a "use client" component built
 * entirely from a single render pass (no effects needed to produce this
 * markup), so `renderToStaticMarkup` is sufficient here.
 */

type DashboardProps = React.ComponentProps<typeof ClientDashboard>;
type Session = DashboardProps["upcomingSessions"][number];

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    scheduledDate: new Date(),
    status: "SCHEDULED",
    workout: {
      name: "Upper Body Strength",
      dayIndex: 0,
      weekIndex: 0,
      estimatedMinutes: 45,
      blocks: [{ exercises: [{ id: "e1" }, { id: "e2" }] }],
    },
    ...overrides,
  };
}

const baseProps: DashboardProps = {
  firstName: "Jamie",
  upcomingSessions: [],
  calendarSessions: [],
  weeklyCompliance: 2,
  recentAssessments: [
    { id: "a1", assessmentType: "GRIP_STRENGTH", value: 42, unit: "kg", createdAt: new Date() },
  ],
  currentStreak: 3,
  workoutsCompleted: 5,
  exercisesCompleted: 20,
  minutesExercised: 120,
  unreadTrainerMessage: null,
  programProgress: {
    programId: "prog-1",
    programName: "8-Week Strength Block",
    week: { current: 3, total: 8 },
    completedSessions: 6,
    totalSessions: 16,
  },
  resources: [
    {
      id: "res-1",
      name: "Morning Mobility",
      workoutCount: 4,
      estimatedMinutes: 15,
      tags: [],
      activities: [],
      goals: [],
      bodyAreas: [],
    },
  ],
  // Minimal shape matching `getInboxThreads`'s resolved rows — the inbox
  // card only reads these fields.
  inboxThreads: [] as unknown as DashboardProps["inboxThreads"],
};

/** Counts real `<Button variant="default">` renders (unique cva fragment), never a hand-rolled `<button>` like the inbox tabs, which also carry `bg-primary text-primary-foreground` for their active state. */
function countPrimaryButtons(html: string): number {
  return (html.match(/bg-primary text-primary-foreground \[a\]:hover:bg-primary\/80/g) ?? []).length;
}

describe("ClientDashboard static render", () => {
  it("renders today's workout with a single filled primary button", () => {
    const html = renderToStaticMarkup(
      <ClientDashboard {...baseProps} upcomingSessions={[makeSession()]} />
    );

    expect(html).toContain("Week 1, Day 1: Upper Body Strength");
    expect(html).toContain("Start workout");
    expect(html).toContain("TODAY");
    expect(countPrimaryButtons(html)).toBe(1);
    expect((html.match(/data-slot="section-card"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("uses the workoutsCompleted fixture value on the Workouts completed stat", () => {
    const html = renderToStaticMarkup(
      <ClientDashboard {...baseProps} upcomingSessions={[makeSession()]} />
    );

    expect(html).toMatch(/>5<\/p>\s*<p[^>]*>Workouts completed<\/p>/);
  });

  it("sanity: the filled-button class fragment appears at least once across fixtures", () => {
    // Guards the `toBe(0)` assertions above and below against vacuously
    // passing because the class fragment itself stopped matching real markup
    // (e.g. after a Button/cva refactor).
    const htmls = [
      renderToStaticMarkup(<ClientDashboard {...baseProps} upcomingSessions={[makeSession()]} />),
      renderToStaticMarkup(
        <ClientDashboard
          {...baseProps}
          upcomingSessions={[makeSession({ id: "future-1", scheduledDate: addDays(new Date(), 3) })]}
        />
      ),
      renderToStaticMarkup(<ClientDashboard {...baseProps} upcomingSessions={[]} />),
    ];

    const totalPrimaryButtons = htmls.reduce((sum, html) => sum + countPrimaryButtons(html), 0);
    expect(totalPrimaryButtons).toBeGreaterThan(0);
  });

  it("renders a future session with an outline Preview action", () => {
    const html = renderToStaticMarkup(
      <ClientDashboard
        {...baseProps}
        upcomingSessions={[makeSession({ id: "future-1", scheduledDate: addDays(new Date(), 3) })]}
      />
    );

    expect(html).toContain("Week 1, Day 1: Upper Body Strength");
    expect(html).toContain("Preview");
    expect(html).toContain("UPCOMING");
    expect(countPrimaryButtons(html)).toBe(0);
    expect((html.match(/data-slot="section-card"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("renders the empty state when nothing is scheduled", () => {
    const html = renderToStaticMarkup(<ClientDashboard {...baseProps} upcomingSessions={[]} />);

    expect(html).toContain("Nothing scheduled right now");
    expect(countPrimaryButtons(html)).toBe(0);
    expect((html.match(/data-slot="section-card"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
