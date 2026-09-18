import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkoutModeWrapper } from "../workout-mode-wrapper";

/**
 * Static-render smoke test for the workout mode-pick screen (the default
 * "pick" mode `WorkoutModeWrapper` renders before a tracker is chosen).
 *
 * `session` is typed `any` on the component, so a minimal fixture is enough
 * to reach the picker without needing a full WorkoutSessionV2 shape. Neither
 * `WorkoutSessionTracker` nor `WorkoutChecklistTracker` render in this mode,
 * so their `next/navigation` `useRouter()` calls never execute and no mock
 * is needed here.
 */

function makeSession() {
  return {
    status: "SCHEDULED",
    scheduledDate: new Date(),
    exerciseLogs: [],
    workout: {
      name: "Upper Body Strength",
      blocks: [
        {
          id: "block-1",
          type: "STRENGTH",
          name: "Main Block",
          rounds: 1,
          exercises: [{ id: "ex-1", sets: [{}] }],
        },
      ],
    },
  };
}

describe("WorkoutModeWrapper static render", () => {
  it("renders both mode options with no filled-primary Button on the pick screen", () => {
    const html = renderToStaticMarkup(<WorkoutModeWrapper session={makeSession()} />);

    expect(html).toContain("Quick Checklist");
    expect(html).toContain("Guided Workout");

    // The mode-pick screen intentionally has no `variant="default"` Button —
    // both options are custom cards styled with the success/info roles (see
    // `workout-tokens.ts`'s WORKOUT_STATE.completed/current), not the
    // primary/brand color. This asserts that stays true rather than
    // asserting a filled-primary count that the current design doesn't have.
    const filledButtonMatches = html.match(/bg-primary text-primary-foreground/g) ?? [];
    expect(filledButtonMatches).toHaveLength(0);
  });
});
