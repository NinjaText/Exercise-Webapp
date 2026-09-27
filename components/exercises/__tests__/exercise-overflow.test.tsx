import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/actions/bulk-exercise-actions", () => ({ bulkCreateExercisesAction: vi.fn() }));
vi.mock("@/actions/exercise-actions", () => ({ adoptUniversalExercisesAction: vi.fn() }));

import { ExerciseRowCard } from "../bulk-import-form";

const row = {
  rowId: "r1",
  videoUrl: "",
  videoFileName: "a-very-long-video-file-name-that-would-push-the-row-wider-than-a-phone.mp4",
  imageUrl: "",
  name: "",
  description: "",
  instructions: "",
  bodyRegion: [],
  difficultyLevel: "",
  exercisePhases: [],
  musclesTargeted: "",
  equipmentRequired: [],
  contraindications: "",
  commonMistakes: "",
  defaultSets: "3",
  defaultReps: "10",
  isAssessment: false,
  aiStatus: "idle" as const,
  expanded: false,
};

describe("exercise tools at narrow widths", () => {
  it("lets the bulk-import file name truncate inside its row", () => {
    const html = renderToStaticMarkup(
      <ExerciseRowCard
        row={row}
        index={0}
        onUpdate={() => {}}
        onRemove={() => {}}
        onGenerate={() => {}}
        onToggleEquipment={() => {}}
        onToggleBodyRegion={() => {}}
      />
    );
    const name = html.match(/<p class="([^"]*)">a-very-long-video/)?.[1]?.split(" ") ?? [];
    expect(name).toEqual(expect.arrayContaining(["min-w-0", "flex-1", "truncate"]));
  });
});
