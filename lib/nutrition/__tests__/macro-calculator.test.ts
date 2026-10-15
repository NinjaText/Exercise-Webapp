import { describe, it, expect } from "vitest";
import {
  ageFromDateOfBirth,
  areStatsValid,
  calculateBmr,
  calculateCalorieTarget,
  calculateMacroGrams,
  calculateMacros,
  calculateTdee,
  clampAdjustment,
  cmToFeetInches,
  feetInchesToCm,
  isSplitValid,
  kgToLb,
  lbToKg,
  rebalanceSplit,
  type MacroCalculationInput,
} from "../macro-calculator";
import { macroCalculatorInputsSchema, parseStoredCalculatorInputs } from "@/lib/validators/macro-calculator";

// 28y female, 165 cm, 68 kg, moderately active, fat loss −15%, balanced split.
// Hand-computed with Mifflin–St Jeor:
//   BMR  = 10·68 + 6.25·165 − 5·28 − 161 = 680 + 1031.25 − 140 − 161 = 1410.25
//   TDEE = 1410.25 × 1.55 = 2185.8875
//   Target = 2185.8875 × 0.85 = 1858.004 → 1858
//   Protein 30% = 557.4 kcal / 4 = 139.35 → 139 g
//   Carbs   40% = 743.2 kcal / 4 = 185.8  → 186 g
//   Fat     30% = 557.4 kcal / 9 = 61.93  → 62 g
// (The design mockup's 1,441 / 2,234 don't match the formula; these do.)
const reference: MacroCalculationInput = {
  age: 28,
  sex: "female",
  heightCm: 165,
  weightKg: 68,
  activity: "moderate",
  goal: "fat_loss",
  adjustmentPct: -15,
  split: { p: 30, c: 40, f: 30 },
  calorieOverride: null,
};

describe("calculateBmr", () => {
  it("applies Mifflin–St Jeor for a female", () => {
    expect(calculateBmr(reference)).toBeCloseTo(1410.25, 5);
  });

  it("adds 166 kcal for a male with the same stats", () => {
    expect(calculateBmr({ ...reference, sex: "male" })).toBeCloseTo(1576.25, 5);
  });
});

describe("calculateTdee / calculateCalorieTarget", () => {
  it("multiplies BMR by the activity factor", () => {
    expect(calculateTdee(1410.25, "moderate")).toBeCloseTo(2185.8875, 5);
    expect(calculateTdee(1000, "sedentary")).toBeCloseTo(1200, 5);
    expect(calculateTdee(1000, "extreme")).toBeCloseTo(1900, 5);
  });

  it("applies the adjustment and rounds to the nearest kcal", () => {
    expect(calculateCalorieTarget(2185.8875, -15)).toBe(1858);
    expect(calculateCalorieTarget(2000, 0)).toBe(2000);
    expect(calculateCalorieTarget(2000, 10)).toBe(2200);
  });
});

describe("calculateMacros (reference client)", () => {
  const result = calculateMacros(reference);

  it("matches the hand-computed energy numbers", () => {
    expect(result.bmr).toBe(1410);
    expect(result.tdee).toBe(2186);
    expect(result.calories).toBe(1858);
    expect(result.computedCalories).toBe(1858);
    expect(result.adjustmentPct).toBe(-15);
    expect(result.adjustmentKcal).toBe(-328);
    expect(result.isOverridden).toBe(false);
  });

  it("matches the hand-computed grams", () => {
    expect(result.proteinG).toBe(139);
    expect(result.carbsG).toBe(186);
    expect(result.fatG).toBe(62);
  });

  it("reports grams per kg to one decimal place", () => {
    expect(result.perKg).toEqual({ protein: 2, carbs: 2.7, fat: 0.9 });
  });

  it("has no warnings", () => {
    expect(result.warnings).toEqual([]);
  });
});

describe("calculateMacros overrides and warnings", () => {
  it("uses the trainer's override for calories and grams", () => {
    const result = calculateMacros({ ...reference, calorieOverride: 2000 });
    expect(result.calories).toBe(2000);
    expect(result.computedCalories).toBe(1858);
    expect(result.isOverridden).toBe(true);
    expect(result.proteinG).toBe(150);
    expect(result.carbsG).toBe(200);
    expect(result.fatG).toBe(67);
  });

  it("clamps an out-of-range adjustment to the goal's range", () => {
    expect(calculateMacros({ ...reference, adjustmentPct: -40 }).adjustmentPct).toBe(-25);
    expect(calculateMacros({ ...reference, goal: "maintenance", adjustmentPct: 10 }).adjustmentPct).toBe(0);
  });

  it("warns below 1200 kcal for a female", () => {
    const result = calculateMacros({ ...reference, calorieOverride: 1150 });
    expect(result.warnings).toContainEqual({ kind: "low_calories", minimum: 1200 });
  });

  it("warns below 1500 kcal for a male", () => {
    const result = calculateMacros({ ...reference, sex: "male", calorieOverride: 1450 });
    expect(result.warnings).toContainEqual({ kind: "low_calories", minimum: 1500 });
    expect(calculateMacros({ ...reference, sex: "male", calorieOverride: 1500 }).warnings).toEqual([]);
  });

  it("warns when protein is under 1.6 g/kg on a fat-loss goal only", () => {
    const lowProtein = { ...reference, split: { p: 20, c: 50, f: 30 } };
    // 1858 × 0.2 / 4 = 92.9 → 93 g / 68 kg = 1.37 g/kg
    expect(calculateMacros(lowProtein).warnings).toContainEqual({
      kind: "low_protein",
      gramsPerKg: 1.4,
      minimum: 1.6,
    });
    expect(
      calculateMacros({ ...lowProtein, goal: "maintenance", adjustmentPct: 0 }).warnings.some(
        (w) => w.kind === "low_protein"
      )
    ).toBe(false);
  });
});

describe("calculateMacroGrams", () => {
  it("uses 4/4/9 kcal per gram", () => {
    expect(calculateMacroGrams(2000, { p: 30, c: 40, f: 30 })).toEqual({ proteinG: 150, carbsG: 200, fatG: 67 });
    expect(calculateMacroGrams(0, { p: 30, c: 40, f: 30 })).toEqual({ proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe("clampAdjustment", () => {
  it("keeps values in range and rounds to whole percent", () => {
    expect(clampAdjustment("fat_loss", -3)).toBe(-5);
    expect(clampAdjustment("fat_loss", -12.4)).toBe(-12);
    expect(clampAdjustment("muscle_gain", 30)).toBe(20);
    expect(clampAdjustment("performance", -5)).toBe(0);
    expect(clampAdjustment("muscle_gain", Number.NaN)).toBe(10);
  });
});

describe("macro split", () => {
  it("validates totals", () => {
    expect(isSplitValid({ p: 30, c: 40, f: 30 })).toBe(true);
    expect(isSplitValid({ p: 30, c: 40, f: 31 })).toBe(false);
    expect(isSplitValid({ p: 30.5, c: 39.5, f: 30 })).toBe(false);
  });

  it("rebalances the other two proportionally and always totals 100", () => {
    expect(rebalanceSplit({ p: 30, c: 40, f: 30 }, "p", 40)).toEqual({ p: 40, c: 34, f: 26 });
    expect(rebalanceSplit({ p: 30, c: 40, f: 30 }, "f", 100)).toEqual({ p: 0, c: 0, f: 100 });
    expect(rebalanceSplit({ p: 0, c: 0, f: 100 }, "f", 50)).toEqual({ p: 25, c: 25, f: 50 });
    expect(rebalanceSplit({ p: 30, c: 40, f: 30 }, "c", 150)).toEqual({ p: 0, c: 100, f: 0 });

    for (let value = 0; value <= 100; value += 7) {
      const next = rebalanceSplit({ p: 33, c: 33, f: 34 }, "c", value);
      expect(isSplitValid(next)).toBe(true);
      expect(next.c).toBe(value);
    }
  });
});

describe("unit conversions", () => {
  it("converts weight both ways", () => {
    expect(lbToKg(150)).toBeCloseTo(68.0389, 3);
    expect(kgToLb(68)).toBeCloseTo(149.914, 2);
  });

  it("converts height both ways", () => {
    expect(feetInchesToCm(5, 5)).toBeCloseTo(165.1, 5);
    expect(cmToFeetInches(165)).toEqual({ feet: 5, inches: 5 });
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
  });
});

describe("areStatsValid", () => {
  it("requires every stat inside its range", () => {
    expect(areStatsValid({ age: 28, sex: "female", heightCm: 165, weightKg: 68 })).toBe(true);
    expect(areStatsValid({ age: 28, heightCm: 165, weightKg: 68 })).toBe(false);
    expect(areStatsValid({ age: 8, sex: "male", heightCm: 165, weightKg: 68 })).toBe(false);
    expect(areStatsValid({ age: 28, sex: "male", heightCm: 16.5, weightKg: 68 })).toBe(false);
  });
});

describe("ageFromDateOfBirth", () => {
  const today = new Date(2026, 9, 15); // 15 Oct 2026, local time

  it("parses ISO dates and respects whether the birthday has passed", () => {
    expect(ageFromDateOfBirth("1998-10-15", today)).toBe(28);
    expect(ageFromDateOfBirth("1998-10-16", today)).toBe(27);
    expect(ageFromDateOfBirth("1998-01-01", today)).toBe(28);
  });

  it("returns null for missing, garbage or implausible values", () => {
    expect(ageFromDateOfBirth(null, today)).toBeNull();
    expect(ageFromDateOfBirth("", today)).toBeNull();
    expect(ageFromDateOfBirth("not a date", today)).toBeNull();
    expect(ageFromDateOfBirth("2020-01-01", today)).toBeNull();
    expect(ageFromDateOfBirth("1998-13-01", today)).toBeNull();
  });
});

describe("calculator inputs schema", () => {
  const stored = {
    units: "metric",
    age: 28,
    sex: "female",
    heightCm: 165,
    weightKg: 68,
    activity: "moderate",
    goal: "fat_loss",
    adjustmentPct: -15,
    split: { p: 30, c: 40, f: 30 },
    calorieOverride: null,
  };

  it("accepts valid stored inputs", () => {
    expect(parseStoredCalculatorInputs(stored)).toEqual(stored);
  });

  it("ignores malformed stored data", () => {
    expect(parseStoredCalculatorInputs(null)).toBeNull();
    expect(parseStoredCalculatorInputs("junk")).toBeNull();
    expect(parseStoredCalculatorInputs({ ...stored, activity: "couch" })).toBeNull();
  });

  it("rejects a split that doesn't total 100", () => {
    expect(macroCalculatorInputsSchema.safeParse({ ...stored, split: { p: 30, c: 40, f: 40 } }).success).toBe(false);
  });

  it("rejects an adjustment outside the goal's range", () => {
    expect(macroCalculatorInputsSchema.safeParse({ ...stored, adjustmentPct: -30 }).success).toBe(false);
    expect(macroCalculatorInputsSchema.safeParse({ ...stored, goal: "maintenance", adjustmentPct: -15 }).success).toBe(
      false
    );
  });
});
