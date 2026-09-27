import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.useFakeTimers({ now: new Date(2026, 8, 16, 12), toFake: ["Date"] });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/actions/session-actions", () => ({ rescheduleSessionAction: vi.fn() }));
vi.mock("@/actions/workout-editor-actions", () => ({
  updateExercisePrescriptionAction: vi.fn(),
  removeBlockExerciseAction: vi.fn(),
  addExerciseToBlockAction: vi.fn(),
  getExercisesForPickerAction: vi.fn(),
  moveWorkoutAction: vi.fn(),
}));
vi.mock("@/actions/calendar-workout-actions", () => ({ deleteSession: vi.fn(), duplicateWorkoutToDateAction: vi.fn() }));
vi.mock("@/actions/program-workout-actions", () => ({
  deleteWorkoutFromProgramAction: vi.fn(),
  duplicateWorkoutToDayAction: vi.fn(),
}));
vi.mock("@/actions/voice-memo-actions", () => ({ getWorkoutVoiceMemos: vi.fn() }));
vi.mock("@/components/voice-memo/VoiceMemoRecorder", () => ({ VoiceMemoRecorder: () => null }));
vi.mock("@/components/voice-memo/VoiceMemoPlayer", () => ({ VoiceMemoPlayer: () => null }));
vi.mock("@/components/programs/exercise-picker-dialog", () => ({ ExercisePickerDialog: () => null }));

import { ProgramScheduleView } from "../program-schedule-view";

const workout = (id: string, name: string, weekIndex = 0, dayIndex = 0) => ({
  id,
  name,
  weekIndex,
  dayIndex,
  blocks: [{ id: `b-${id}`, exercises: [{ id: `x-${id}`, exercise: { id: "e" }, sets: [] }] }],
});

function render(props: { rawWorkouts?: Record<string, unknown>[]; rawSessions?: Record<string, unknown>[] }) {
  return renderToStaticMarkup(
    <ProgramScheduleView rawWorkouts={props.rawWorkouts ?? []} rawSessions={props.rawSessions ?? []} trainerName="Coach" />
  );
}

/** The phone agenda: the `sm:hidden` block rendered before the calendar. */
function agenda(html: string) {
  return html.match(/<div class="space-y-4 sm:hidden">([\s\S]*?)<div class="hidden overflow-x-auto rounded-xl bg-card p-4 shadow-xs ring-1 ring-border sm:block sm:p-5">/)?.[1] ?? "";
}

describe("ProgramScheduleView on phones", () => {
  it("lists sessions in date order in the phone agenda, calendar only from sm up", () => {
    const html = render({
      rawSessions: [
        { id: "s3", scheduledDate: "2026-09-18T00:00:00.000Z", status: "SCHEDULED", workout: workout("w3", "Friday Pull") },
        { id: "s1", scheduledDate: "2026-09-14T00:00:00.000Z", status: "COMPLETED", workout: workout("w1", "Monday Push") },
        { id: "s2", scheduledDate: "2026-09-16T00:00:00.000Z", status: "SCHEDULED", workout: workout("w2", "Wednesday Legs") },
      ],
    });
    const list = agenda(html);
    const positions = ["Monday Push", "Wednesday Legs", "Friday Pull"].map((name) => list.indexOf(name));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(list).toContain("Rest day");
    expect(html).toContain('ring-border sm:block sm:p-5"><div class="schedule-day-only');
  });

  it("lists template workouts by their week and day position", () => {
    const list = agenda(
      render({ rawWorkouts: [workout("w2", "Day Three", 0, 2), workout("w1", "Day One", 0, 0), workout("w9", "Week Two", 1, 0)] })
    );
    expect(list).toContain("Week 1 of 2");
    expect(list.indexOf("Day One")).toBeGreaterThan(-1);
    expect(list.indexOf("Day One")).toBeLessThan(list.indexOf("Day Three"));
    expect(list).not.toContain("Week Two");
  });

  it("keeps the drag hint off phones", () => {
    const html = render({ rawWorkouts: [workout("w1", "Day One")] });
    expect(html).toContain('<span class="hidden sm:inline">Drag workouts to move them to a different day or week');
  });
});
