/**
 * Form state for the macro calculator UI. Text inputs are kept as strings so
 * a half-typed value ("1", "") doesn't get coerced mid-edit; they're parsed
 * into canonical metric MacroCalculatorInputs only when computing results or
 * saving. Pure functions — no React — so they're trivially testable.
 */
import {
  DEFAULT_SPLIT,
  areStatsValid,
  cmToFeetInches,
  feetInchesToCm,
  getGoal,
  kgToLb,
  lbToKg,
  roundTo,
  type ActivityLevel,
  type Goal,
  type MacroSplit,
  type Sex,
  type UnitSystem,
} from "@/lib/nutrition/macro-calculator";
import {
  macroCalculatorInputsSchema,
  type MacroCalculatorInputs,
} from "@/lib/validators/macro-calculator";

export interface CalculatorFormState {
  units: UnitSystem;
  age: string;
  sex: Sex | null;
  /** Metric height, cm. Used when units = "metric". */
  heightCm: string;
  /** Imperial height, whole feet + inches. Used when units = "imperial". */
  heightFt: string;
  heightIn: string;
  /** Weight in the current unit system (kg or lb). */
  weight: string;
  activity: ActivityLevel;
  goal: Goal;
  adjustmentPct: number;
  split: MacroSplit;
  calorieOverride: number | null;
}

const DEFAULT_GOAL: Goal = "fat_loss";

function formatNumber(value: number, dp: number): string {
  return String(roundTo(value, dp));
}

/** Parses a user-typed number; undefined for blank or non-numeric text. */
export function parseNumberText(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** Blank form; age prefilled from the client's date of birth when known. */
export function createDefaultFormState(defaultAge: number | null): CalculatorFormState {
  return {
    units: "metric",
    age: defaultAge !== null ? String(defaultAge) : "",
    sex: null,
    heightCm: "",
    heightFt: "",
    heightIn: "",
    weight: "",
    activity: "moderate",
    goal: DEFAULT_GOAL,
    adjustmentPct: getGoal(DEFAULT_GOAL).defaultPct,
    split: { ...DEFAULT_SPLIT },
    calorieOverride: null,
  };
}

/** Rehydrates the form from previously saved calculator inputs. */
export function formStateFromInputs(inputs: MacroCalculatorInputs): CalculatorFormState {
  const { feet, inches } = cmToFeetInches(inputs.heightCm);
  return {
    units: inputs.units,
    age: String(inputs.age),
    sex: inputs.sex,
    heightCm: formatNumber(inputs.heightCm, 1),
    heightFt: String(feet),
    heightIn: String(inches),
    weight:
      inputs.units === "imperial"
        ? formatNumber(kgToLb(inputs.weightKg), 1)
        : formatNumber(inputs.weightKg, 1),
    activity: inputs.activity,
    goal: inputs.goal,
    adjustmentPct: inputs.adjustmentPct,
    split: { ...inputs.split },
    calorieOverride: inputs.calorieOverride,
  };
}

/** Canonical metric height from the form, or undefined if not entered. */
export function heightCmFromForm(form: CalculatorFormState): number | undefined {
  if (form.units === "metric") return parseNumberText(form.heightCm);
  const feet = parseNumberText(form.heightFt);
  if (feet === undefined) return undefined;
  const inches = parseNumberText(form.heightIn) ?? 0;
  return roundTo(feetInchesToCm(feet, inches), 1);
}

/** Canonical metric weight from the form, or undefined if not entered. */
export function weightKgFromForm(form: CalculatorFormState): number | undefined {
  const weight = parseNumberText(form.weight);
  if (weight === undefined) return undefined;
  return form.units === "metric" ? weight : roundTo(lbToKg(weight), 1);
}

/**
 * Switches unit system, converting the entered height/weight so the trainer
 * doesn't have to retype them. Blank fields stay blank.
 */
export function switchUnits(form: CalculatorFormState, units: UnitSystem): CalculatorFormState {
  if (form.units === units) return form;

  const heightCm = heightCmFromForm(form);
  const weightKg = weightKgFromForm(form);
  const next: CalculatorFormState = { ...form, units };

  if (units === "imperial") {
    if (heightCm !== undefined) {
      const { feet, inches } = cmToFeetInches(heightCm);
      next.heightFt = String(feet);
      next.heightIn = String(inches);
    }
    next.weight = weightKg !== undefined ? formatNumber(kgToLb(weightKg), 1) : "";
  } else {
    next.heightCm = heightCm !== undefined ? formatNumber(heightCm, 1) : "";
    next.weight = weightKg !== undefined ? formatNumber(weightKg, 1) : "";
  }
  return next;
}

/**
 * Converts the form into validated canonical inputs, or null while anything
 * required is missing / out of range. The same schema guards the server
 * action, so a non-null result is always saveable.
 */
export function formToInputs(form: CalculatorFormState): MacroCalculatorInputs | null {
  const ageValue = parseNumberText(form.age);
  const candidate = {
    units: form.units,
    age: ageValue !== undefined ? Math.round(ageValue) : undefined,
    sex: form.sex ?? undefined,
    heightCm: heightCmFromForm(form),
    weightKg: weightKgFromForm(form),
  };
  if (!areStatsValid(candidate)) return null;

  const parsed = macroCalculatorInputsSchema.safeParse({
    ...candidate,
    activity: form.activity,
    goal: form.goal,
    adjustmentPct: form.adjustmentPct,
    split: form.split,
    calorieOverride: form.calorieOverride,
  });
  return parsed.success ? parsed.data : null;
}
