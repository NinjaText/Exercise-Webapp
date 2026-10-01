import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/actions/bulk-exercise-actions", () => ({ bulkCreateExercisesAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ExerciseRowCard, type ExerciseRow } from "../bulk-import-form";

function row(over: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    rowId: "r1",
    videoUrl: "https://example.com/v.mp4",
    videoFileName: "v.mp4",
    imageUrl: "",
    name: "Squat",
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
    aiStatus: "idle",
    expanded: false,
    ...over,
  };
}

const noop = () => {};

/** Returns the opening tag of the AI generate / regenerate button. */
function aiButtonTag(html: string): string {
  const tags = html.match(/<button[^>]*>/g) ?? [];
  const tag = tags.find((t) => t.includes('data-state="on"') || t.includes('data-state="off"'));
  expect(tag).toBeDefined();
  return tag!;
}

function render(r: ExerciseRow) {
  return renderToStaticMarkup(
    <ExerciseRowCard
      row={r}
      index={0}
      onUpdate={noop}
      onRemove={noop}
      onGenerate={noop}
      onToggleEquipment={noop}
      onToggleBodyRegion={noop}
    />
  );
}

describe("bulk import row AI button", () => {
  it("marks the AI-filled state so it looks distinct from the idle state", () => {
    const idle = aiButtonTag(render(row()));
    const done = aiButtonTag(render(row({ aiStatus: "done" })));

    expect(idle).toContain('data-state="off"');
    expect(done).toContain('data-state="on"');
    // The shared hairline look carries the "on" style, keyed off data-state.
    expect(done).toContain("data-[state=on]:bg-muted");
    // Not a toggle, so it must not be announced as one.
    expect(done).not.toMatch(/\saria-pressed=/);
    expect(render(row({ aiStatus: "done" }))).toContain("Regenerate");
  });

  it("keeps the green ring signal on ready rows only", () => {
    const ready = render(row({ bodyRegion: ["Legs"], difficultyLevel: "BEGINNER" }));
    expect(ready).toContain("ring-success-border");
    expect(render(row())).not.toContain("ring-success-border");
  });
});
