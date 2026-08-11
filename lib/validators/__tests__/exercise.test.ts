import { describe, it, expect } from "vitest";
import { createExerciseSchema } from "../exercise";

describe("createExerciseSchema bodyRegion", () => {
  const base = {
    name: "Squat",
    difficultyLevel: "BEGINNER",
    equipmentRequired: [],
    contraindications: [],
  };

  it("accepts multiple body regions", () => {
    const result = createExerciseSchema.safeParse({ ...base, bodyRegion: ["CORE", "UPPER_BODY"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bodyRegion).toEqual(["CORE", "UPPER_BODY"]);
  });

  it("rejects an empty body region array", () => {
    const result = createExerciseSchema.safeParse({ ...base, bodyRegion: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a bare string (the old single-value shape)", () => {
    const result = createExerciseSchema.safeParse({ ...base, bodyRegion: "CORE" });
    expect(result.success).toBe(false);
  });
});

describe("createExerciseSchema isAssessment", () => {
  const base = {
    name: "Squat",
    difficultyLevel: "BEGINNER",
    bodyRegion: ["LOWER_BODY"],
    equipmentRequired: [],
    contraindications: [],
  };

  it("accepts isAssessment: true", () => {
    const result = createExerciseSchema.safeParse({ ...base, isAssessment: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAssessment).toBe(true);
  });

  it("defaults isAssessment to false when omitted", () => {
    const result = createExerciseSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAssessment).toBe(false);
  });
});
