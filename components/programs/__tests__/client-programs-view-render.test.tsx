import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientProgramsView, type ClientProgramCard } from "../client-programs-view";
import type { ProgramProgress } from "@/lib/services/program.service";

function program(over: Partial<ClientProgramCard> = {}): ClientProgramCard {
  return {
    id: "p1",
    name: "Program",
    description: null,
    status: "ACTIVE",
    schedulingType: "SCHEDULED",
    startDate: new Date("2026-01-01"),
    durationWeeks: 8,
    tags: [],
    activities: [],
    goals: [],
    bodyAreas: [],
    workouts: [],
    _count: { workouts: 4 },
    week: { current: 2, total: 8 },
    ...over,
  };
}

describe("ClientProgramsView", () => {
  it("renders the shared header with line tabs and exactly one filled button", () => {
    const scheduled = program({ id: "scheduled-1", name: "Shoulder Rehab" });
    const resource = program({
      id: "resource-1",
      name: "Morning Mobility",
      schedulingType: "ON_DEMAND",
      week: null,
    });

    const progressByProgramId: Record<string, ProgramProgress> = {
      "scheduled-1": {
        completed: 2,
        total: 8,
        nextSession: {
          sessionId: "session-1",
          workoutName: "Upper Body Strength",
          scheduledDate: new Date("2026-09-20"),
          estimatedMinutes: 45,
          exerciseCount: 6,
        },
      },
    };

    const html = renderToStaticMarkup(
      <ClientProgramsView
        programs={[scheduled, resource]}
        progressByProgramId={progressByProgramId}
        initialTab="programs"
      />
    );

    // The line-tab labels for both tabs render, with their counts.
    expect(html).toContain("Programs (1)");
    expect(html).toContain("Resources (1)");

    // The shared PageHeader renders inside the view (moved out of the page).
    expect(html).toContain('data-slot="page-header"');

    // Exactly one "current" program's Continue button is filled; every other
    // button on the page (View Program / View Resource) is outline.
    const filledButtonMatches = html.match(/bg-primary text-primary-foreground/g) ?? [];
    expect(filledButtonMatches).toHaveLength(1);
  });
});
