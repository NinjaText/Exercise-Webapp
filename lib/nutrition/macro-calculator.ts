/**
 * Pure maths for the trainer macro calculator. No React, no Prisma — shared
 * by the calculator UI (live preview) and the save action (which recomputes
 * from the submitted inputs so the stored targets always match the maths).
 *
 * Formulas:
 *  - BMR: Mifflin–St Jeor (1990)
 *      male   = 10·kg + 6.25·cm − 5·age + 5
 *      female = 10·kg + 6.25·cm − 5·age − 161
 *  - TDEE = BMR × activity multiplier
 *  - Target = TDEE × (1 + adjustment% / 100), unless the trainer overrides it
 *  - Grams = target kcal × macro% ÷ kcal-per-gram (4 / 4 / 9)
 *
 * Rounding: kcal to the nearest 1, grams to the nearest 1. Intermediate
 * values stay unrounded so rounding error doesn't compound.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary", multiplier: 1.2, hint: "Little or no exercise" },
  { id: "light", label: "Lightly active", multiplier: 1.375, hint: "1–3 days/week" },
  { id: "moderate", label: "Moderately active", multiplier: 1.55, hint: "3–5 days/week" },
  { id: "very", label: "Very active", multiplier: 1.725, hint: "6–7 days/week" },
  { id: "extreme", label: "Extremely active", multiplier: 1.9, hint: "Physical job + training" },
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]["id"];
export const ACTIVITY_LEVEL_IDS = ACTIVITY_LEVELS.map((a) => a.id) as [ActivityLevel, ...ActivityLevel[]];

export const GOALS = [
  { id: "fat_loss", label: "Fat loss", description: "Calorie deficit", defaultPct: -15, minPct: -25, maxPct: -5 },
  { id: "maintenance", label: "Maintenance", description: "Hold current weight", defaultPct: 0, minPct: 0, maxPct: 0 },
  { id: "muscle_gain", label: "Muscle gain", description: "Calorie surplus", defaultPct: 10, minPct: 5, maxPct: 20 },
  { id: "performance", label: "Performance", description: "Fuel training", defaultPct: 5, minPct: 0, maxPct: 15 },
] as const;
export type Goal = (typeof GOALS)[number]["id"];
export const GOAL_IDS = GOALS.map((g) => g.id) as [Goal, ...Goal[]];

export interface MacroSplit {
  /** Percent of calories from protein (0–100). */
  p: number;
  /** Percent of calories from carbs (0–100). */
  c: number;
  /** Percent of calories from fat (0–100). */
  f: number;
}

export const MACRO_PRESETS = [
  { id: "balanced", label: "Balanced", split: { p: 30, c: 40, f: 30 } },
  { id: "high_protein", label: "Higher protein", split: { p: 35, c: 35, f: 30 } },
  { id: "low_carb", label: "Lower carb", split: { p: 35, c: 25, f: 40 } },
] as const satisfies readonly { id: string; label: string; split: MacroSplit }[];

export const DEFAULT_SPLIT: MacroSplit = { ...MACRO_PRESETS[0].split };

/** Plausible ranges for client stats; outside these the calculator shows no result. */
export const STAT_LIMITS = {
  age: { min: 13, max: 100 },
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 350 },
} as const;

/** Floors below which a gentle low-calorie warning is shown. */
export const MIN_SAFE_CALORIES: Record<Sex, number> = { male: 1500, female: 1200 };

/** Recommended protein floor (g per kg body weight) while in a deficit. */
export const MIN_FAT_LOSS_PROTEIN_G_PER_KG = 1.6;

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getActivityLevel(id: ActivityLevel) {
  return ACTIVITY_LEVELS.find((a) => a.id === id) ?? ACTIVITY_LEVELS[0];
}

export function getGoal(id: Goal) {
  return GOALS.find((g) => g.id === id) ?? GOALS[0];
}

/** Clamps an adjustment percentage into the goal's allowed range. */
export function clampAdjustment(goal: Goal, pct: number): number {
  const { minPct, maxPct } = getGoal(goal);
  if (!Number.isFinite(pct)) return getGoal(goal).defaultPct;
  return Math.min(maxPct, Math.max(minPct, Math.round(pct)));
}

// ─── Unit conversions ────────────────────────────────────────────────────────

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

/** Splits a height in cm into whole feet + whole inches (inches 0–11). */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** Rounds to `dp` decimal places. */
export function roundTo(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

// ─── Energy ──────────────────────────────────────────────────────────────────

export interface ClientStats {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
}

/** Mifflin–St Jeor basal metabolic rate in kcal/day (unrounded). */
export function calculateBmr({ age, sex, heightCm, weightKg }: ClientStats): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/** Total daily energy expenditure in kcal/day (unrounded). */
export function calculateTdee(bmr: number, activity: ActivityLevel): number {
  return bmr * getActivityLevel(activity).multiplier;
}

/** TDEE adjusted by a goal percentage, rounded to the nearest kcal. */
export function calculateCalorieTarget(tdee: number, adjustmentPct: number): number {
  return Math.round(tdee * (1 + adjustmentPct / 100));
}

/** True when the stats fall inside STAT_LIMITS (i.e. the maths is meaningful). */
export function areStatsValid(stats: Partial<ClientStats>): stats is ClientStats {
  const { age, heightCm, weightKg, sex } = stats;
  const inRange = (v: number | undefined, { min, max }: { min: number; max: number }) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  return (
    (sex === "male" || sex === "female") &&
    inRange(age, STAT_LIMITS.age) &&
    inRange(heightCm, STAT_LIMITS.heightCm) &&
    inRange(weightKg, STAT_LIMITS.weightKg)
  );
}

// ─── Macros ──────────────────────────────────────────────────────────────────

export function isSplitValid(split: MacroSplit): boolean {
  const parts = [split.p, split.c, split.f];
  return (
    parts.every((v) => Number.isInteger(v) && v >= 0 && v <= 100) &&
    parts.reduce((sum, v) => sum + v, 0) === 100
  );
}

const SPLIT_KEYS = ["p", "c", "f"] as const;
export type MacroKey = (typeof SPLIT_KEYS)[number];

/**
 * Sets one macro's percentage and rebalances the other two so the split
 * still totals 100. The other two share the remainder in proportion to their
 * previous values (equally if both were 0). Whole percentages only.
 */
export function rebalanceSplit(split: MacroSplit, key: MacroKey, value: number): MacroSplit {
  const next = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
  const [a, b] = SPLIT_KEYS.filter((k) => k !== key);
  const remainder = 100 - next;
  const prevTotal = split[a] + split[b];
  const aShare = prevTotal > 0 ? Math.round((remainder * split[a]) / prevTotal) : Math.round(remainder / 2);

  const result: MacroSplit = { ...split };
  result[key] = next;
  result[a] = aShare;
  result[b] = remainder - aShare;
  return result;
}

export interface MacroGrams {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Converts a calorie target and % split into whole grams per macro. */
export function calculateMacroGrams(calories: number, split: MacroSplit): MacroGrams {
  return {
    proteinG: Math.round((calories * split.p) / 100 / KCAL_PER_GRAM.protein),
    carbsG: Math.round((calories * split.c) / 100 / KCAL_PER_GRAM.carbs),
    fatG: Math.round((calories * split.f) / 100 / KCAL_PER_GRAM.fat),
  };
}

// ─── Full calculation ────────────────────────────────────────────────────────

export interface MacroCalculationInput extends ClientStats {
  activity: ActivityLevel;
  goal: Goal;
  adjustmentPct: number;
  split: MacroSplit;
  /** Trainer-entered daily calories; replaces the computed target when set. */
  calorieOverride: number | null;
}

export interface MacroCalculationResult extends MacroGrams {
  bmr: number;
  tdee: number;
  /** Adjustment actually applied (clamped to the goal's range). */
  adjustmentPct: number;
  /** Computed target minus TDEE, in kcal (negative = deficit). */
  adjustmentKcal: number;
  /** TDEE × adjustment, before any override. */
  computedCalories: number;
  /** The daily target that gets saved (override or computed). */
  calories: number;
  isOverridden: boolean;
  /** Grams per kg body weight, 1 decimal place. */
  perKg: { protein: number; carbs: number; fat: number };
  warnings: MacroWarning[];
}

export type MacroWarning =
  | { kind: "low_calories"; minimum: number }
  | { kind: "low_protein"; gramsPerKg: number; minimum: number };

export function calculateMacros(input: MacroCalculationInput): MacroCalculationResult {
  const bmrRaw = calculateBmr(input);
  const tdeeRaw = calculateTdee(bmrRaw, input.activity);
  const adjustmentPct = clampAdjustment(input.goal, input.adjustmentPct);
  const computedCalories = calculateCalorieTarget(tdeeRaw, adjustmentPct);
  const tdee = Math.round(tdeeRaw);

  const isOverridden = input.calorieOverride !== null && input.calorieOverride > 0;
  const calories = isOverridden ? Math.round(input.calorieOverride as number) : computedCalories;
  const grams = calculateMacroGrams(calories, input.split);

  const perKg = {
    protein: roundTo(grams.proteinG / input.weightKg, 1),
    carbs: roundTo(grams.carbsG / input.weightKg, 1),
    fat: roundTo(grams.fatG / input.weightKg, 1),
  };

  const warnings: MacroWarning[] = [];
  const minimum = MIN_SAFE_CALORIES[input.sex];
  if (calories < minimum) warnings.push({ kind: "low_calories", minimum });
  if (input.goal === "fat_loss" && grams.proteinG / input.weightKg < MIN_FAT_LOSS_PROTEIN_G_PER_KG) {
    warnings.push({ kind: "low_protein", gramsPerKg: perKg.protein, minimum: MIN_FAT_LOSS_PROTEIN_G_PER_KG });
  }

  return {
    bmr: Math.round(bmrRaw),
    tdee,
    adjustmentPct,
    adjustmentKcal: computedCalories - tdee,
    computedCalories,
    calories,
    isOverridden,
    ...grams,
    perKg,
    warnings,
  };
}

// ─── Age ─────────────────────────────────────────────────────────────────────

/**
 * Best-effort age from the free-text User.dateOfBirth. Accepts ISO
 * "YYYY-MM-DD" (what the profile date input stores) or anything Date can
 * parse. Returns null when unparseable or outside STAT_LIMITS.age.
 */
export function ageFromDateOfBirth(dateOfBirth: string | null | undefined, today: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const trimmed = dateOfBirth.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  let year: number, month: number, day: number;
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    [year, month, day] = [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()];
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const todayMonth = today.getMonth() + 1;
  const hadBirthday = todayMonth > month || (todayMonth === month && today.getDate() >= day);
  const age = today.getFullYear() - year - (hadBirthday ? 0 : 1);
  return age >= STAT_LIMITS.age.min && age <= STAT_LIMITS.age.max ? age : null;
}
