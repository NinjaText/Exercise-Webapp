import { z } from "zod";
import {
  ACTIVITY_LEVEL_IDS,
  GOAL_IDS,
  SEXES,
  STAT_LIMITS,
  UNIT_SYSTEMS,
  clampAdjustment,
  isSplitValid,
} from "@/lib/nutrition/macro-calculator";

const percent = z.number().int().min(0).max(100);

/**
 * Inputs the trainer used in the macro calculator. Persisted verbatim on
 * NutritionTarget.calculatorInputs and re-validated on every read, so a
 * malformed stored document is ignored rather than crashing the page.
 * Height/weight are always canonical metric; `units` only records which
 * system the trainer was viewing.
 */
export const macroCalculatorInputsSchema = z
  .object({
    units: z.enum(UNIT_SYSTEMS),
    age: z.number().int().min(STAT_LIMITS.age.min).max(STAT_LIMITS.age.max),
    sex: z.enum(SEXES),
    heightCm: z.number().min(STAT_LIMITS.heightCm.min).max(STAT_LIMITS.heightCm.max),
    weightKg: z.number().min(STAT_LIMITS.weightKg.min).max(STAT_LIMITS.weightKg.max),
    activity: z.enum(ACTIVITY_LEVEL_IDS),
    goal: z.enum(GOAL_IDS),
    adjustmentPct: z.number().int().min(-100).max(100),
    split: z.object({ p: percent, c: percent, f: percent }),
    calorieOverride: z.number().int().min(500).max(20000).nullable(),
  })
  .refine((v) => isSplitValid(v.split), {
    message: "Macro split must total 100%",
    path: ["split"],
  })
  .refine((v) => clampAdjustment(v.goal, v.adjustmentPct) === v.adjustmentPct, {
    message: "Calorie adjustment is outside the goal's range",
    path: ["adjustmentPct"],
  });

export type MacroCalculatorInputs = z.infer<typeof macroCalculatorInputsSchema>;

export const saveMacroCalculatorSchema = z.object({
  clientId: z.string().min(1),
  inputs: macroCalculatorInputsSchema,
});

/** Parses stored calculator inputs; returns null for missing or malformed data. */
export function parseStoredCalculatorInputs(value: unknown): MacroCalculatorInputs | null {
  if (value === null || value === undefined) return null;
  const parsed = macroCalculatorInputsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
