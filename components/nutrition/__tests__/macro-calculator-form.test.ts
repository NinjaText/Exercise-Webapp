import { describe, it, expect } from "vitest";
import {
  createDefaultFormState,
  formStateFromInputs,
  formToInputs,
  switchUnits,
  type CalculatorFormState,
} from "../macro-calculator-form";

function filledMetric(): CalculatorFormState {
  return { ...createDefaultFormState(28), sex: "female", heightCm: "165", weight: "68" };
}

describe("macro calculator form state", () => {
  it("prefills age and stays incomplete until stats are entered", () => {
    const form = createDefaultFormState(28);
    expect(form.age).toBe("28");
    expect(formToInputs(form)).toBeNull();
    expect(createDefaultFormState(null).age).toBe("");
  });

  it("produces canonical metric inputs", () => {
    expect(formToInputs(filledMetric())).toMatchObject({
      units: "metric",
      age: 28,
      sex: "female",
      heightCm: 165,
      weightKg: 68,
      goal: "fat_loss",
      adjustmentPct: -15,
      split: { p: 30, c: 40, f: 30 },
      calorieOverride: null,
    });
  });

  it("converts imperial entries to metric", () => {
    const form: CalculatorFormState = {
      ...createDefaultFormState(28),
      units: "imperial",
      sex: "female",
      heightFt: "5",
      heightIn: "5",
      weight: "150",
    };
    expect(formToInputs(form)).toMatchObject({ units: "imperial", heightCm: 165.1, weightKg: 68 });
  });

  it("converts entered values when switching units", () => {
    const imperial = switchUnits(filledMetric(), "imperial");
    expect(imperial).toMatchObject({ units: "imperial", heightFt: "5", heightIn: "5", weight: "149.9" });

    const backToMetric = switchUnits(imperial, "metric");
    expect(backToMetric).toMatchObject({ units: "metric", heightCm: "165.1", weight: "68" });
  });

  it("rejects out-of-range stats and non-100 splits", () => {
    expect(formToInputs({ ...filledMetric(), weight: "5" })).toBeNull();
    expect(formToInputs({ ...filledMetric(), split: { p: 30, c: 40, f: 40 } })).toBeNull();
  });

  it("round-trips saved inputs", () => {
    const inputs = formToInputs({ ...filledMetric(), calorieOverride: 1900 });
    expect(inputs).not.toBeNull();
    expect(formToInputs(formStateFromInputs(inputs!))).toEqual(inputs);
  });
});
