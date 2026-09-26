import { describe, it, expect } from "vitest";
import { resolveExerciseAudience } from "../exercise-context";

describe("resolveExerciseAudience", () => {
  it("returns BOTH when rehab and performance are both selected", () => {
    expect(resolveExerciseAudience(["CLINICAL", "PERFORMANCE"])).toBe("BOTH");
    expect(resolveExerciseAudience(["PERFORMANCE", "CLINICAL"])).toBe("BOTH");
  });

  it("returns the single selected context", () => {
    expect(resolveExerciseAudience(["CLINICAL"])).toBe("CLINICAL");
    expect(resolveExerciseAudience(["PERFORMANCE"])).toBe("PERFORMANCE");
  });

  it("accepts the legacy single-string payload", () => {
    expect(resolveExerciseAudience("PERFORMANCE")).toBe("PERFORMANCE");
    expect(resolveExerciseAudience("CLINICAL")).toBe("CLINICAL");
  });

  it("falls back to CLINICAL for empty or unrecognised input", () => {
    expect(resolveExerciseAudience(undefined)).toBe("CLINICAL");
    expect(resolveExerciseAudience([])).toBe("CLINICAL");
    expect(resolveExerciseAudience(["NONSENSE"])).toBe("CLINICAL");
  });
});
