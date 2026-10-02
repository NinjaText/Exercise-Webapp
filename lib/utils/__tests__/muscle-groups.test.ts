import { describe, it, expect } from "vitest";
import {
  MUSCLE_GROUPS,
  expandMuscleGroups,
  musclesToGroups,
  applyMuscleGroupSelection,
} from "@/lib/utils/constants";

describe("MUSCLE_GROUPS", () => {
  it("every group matches its own label, so saving a label is filterable", () => {
    for (const group of MUSCLE_GROUPS) {
      expect(expandMuscleGroups([group.value])).toContain(group.label);
    }
  });
});

describe("musclesToGroups", () => {
  it("maps anatomical names to canonical groups case-insensitively", () => {
    expect(musclesToGroups(["Biceps Brachii", "VASTUS MEDIALIS", "brachialis"])).toEqual([
      "QUADRICEPS",
      "BICEPS",
    ]);
  });

  it("ignores unknown names and surrounding whitespace", () => {
    expect(musclesToGroups(["  glutes ", "mystery muscle"])).toEqual(["GLUTES"]);
  });

  it("returns an empty list for no muscles", () => {
    expect(musclesToGroups([])).toEqual([]);
  });
});

describe("applyMuscleGroupSelection", () => {
  it("adds the label for a newly selected group", () => {
    expect(applyMuscleGroupSelection([], ["BICEPS"])).toEqual(["Biceps"]);
  });

  it("keeps existing anatomical names for groups that stay selected", () => {
    expect(
      applyMuscleGroupSelection(["biceps brachii", "brachialis"], ["BICEPS"])
    ).toEqual(["biceps brachii", "brachialis"]);
  });

  it("removes every name belonging to a deselected group", () => {
    expect(
      applyMuscleGroupSelection(["biceps brachii", "Quadriceps", "rectus femoris"], ["BICEPS"])
    ).toEqual(["biceps brachii"]);
  });

  it("preserves names that do not map to any group", () => {
    expect(
      applyMuscleGroupSelection(["mystery muscle", "triceps"], [])
    ).toEqual(["mystery muscle"]);
  });

  it("is a no-op when the selection matches what is stored", () => {
    const raw = ["gluteus medius", "Hamstrings", "mystery muscle"];
    expect(applyMuscleGroupSelection(raw, musclesToGroups(raw))).toEqual(raw);
  });
});
