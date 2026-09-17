import { describe, it, expect } from "vitest";
import { summarizePrescription } from "../collapsed-exercise-row";

const set = (over: Record<string, unknown> = {}) => ({
  orderIndex: 0,
  setType: "NORMAL",
  targetReps: 10,
  targetWeight: null,
  targetDuration: null,
  targetDistance: null,
  targetRPE: null,
  restAfter: null,
  ...over,
});

describe("summarizePrescription", () => {
  it("summarizes uniform rep sets as N × R", () => {
    expect(summarizePrescription([set(), set(), set()] as never)).toBe("3 × 10");
  });

  it("summarizes a single set without a multiplier", () => {
    expect(summarizePrescription([set()] as never)).toBe("1 × 10");
  });

  it("uses seconds for duration-based sets", () => {
    expect(
      summarizePrescription([set({ targetReps: null, targetDuration: 30 })] as never)
    ).toBe("1 × 30s");
  });

  it("falls back to a set count when prescriptions differ", () => {
    expect(
      summarizePrescription([set({ targetReps: 10 }), set({ targetReps: 8 })] as never)
    ).toBe("2 sets");
  });

  it("returns an empty string for no sets", () => {
    expect(summarizePrescription([] as never)).toBe("");
  });
});
