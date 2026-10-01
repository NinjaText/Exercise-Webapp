import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import * as nutritionService from "@/lib/services/nutrition.service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Allowed gap between a model's calories and the 4/4/9 kcal implied by its own macros. */
const CALORIE_MACRO_TOLERANCE = 0.1;

/**
 * Models generate calories and macros independently, so they can contradict
 * each other (e.g. 2400 kcal next to macros worth 2680 kcal). When the gap is
 * beyond tolerance, calories are recomputed from the macros (protein/carbs
 * 4 kcal/g, fat 9 kcal/g) so the logged numbers are always self-consistent.
 */
export function reconcileCalories<T extends { calories: number; proteinG: number; carbsG: number; fatG: number }>(
  estimate: T
): T {
  const macroCalories = estimate.proteinG * 4 + estimate.carbsG * 4 + estimate.fatG * 9;
  if (macroCalories <= 0) return estimate;
  if (Math.abs(estimate.calories - macroCalories) / macroCalories <= CALORIE_MACRO_TOLERANCE) return estimate;
  return { ...estimate, calories: Math.round(macroCalories) };
}

// ─── Meal Photo Analysis ─────────────────────────────────────────────────────

const mealPhotoSchema = z.object({
  foods: z
    .array(
      z.object({
        name: z.string().describe("Food item name, e.g. 'Turkey club sandwich' or 'French fries'"),
        quantity: z
          .string()
          .describe(
            "The amount these numbers are for, stating any size you assumed, e.g. '1 sandwich', '6 oz', '1 cup' or '1 whole 12\" medium pizza (8 slices)'"
          ),
        calories: z.number().int().min(0).describe("Estimated calories for this whole item, including all of its components"),
        proteinG: z.number().min(0).describe("Estimated grams of protein for this whole item"),
        carbsG: z.number().min(0).describe("Estimated grams of carbohydrates for this whole item"),
        fatG: z.number().min(0).describe("Estimated grams of fat for this whole item"),
        components: z
          .array(z.string())
          .max(12)
          .describe(
            "For a combined dish (sandwich, burger, wrap, salad, bowl, pizza, etc.), the visible ingredients it is made of, e.g. ['whole wheat bread', 'turkey', 'cheddar', 'lettuce']. These are descriptive only — their nutrition is already included in this item's totals. Empty array for single foods."
          ),
      })
    )
    .min(1)
    .max(10),
});

export type MealPhotoFoodDraft = z.infer<typeof mealPhotoSchema>["foods"][number];

const ESTIMATION_GUIDELINES = `How to estimate:
- Base the numbers on typical published nutrition data for that food (standard recipes, common restaurant/brand values), not a guess from scratch.
- Judge size from visual cues (plate, utensils, hands, packaging). With no clear cues, assume the most common size (e.g. a medium 12" pizza, a standard sandwich) — never the largest.
- Calories must agree with the macros: protein and carbs are 4 kcal/g, fat is 9 kcal/g.
- These are draft values a person will review and correct before saving, so be realistic rather than inflated.`;

const MEAL_PHOTO_PROMPT = `Identify the foods in this meal photo and estimate the serving size and the calories, protein, carbs, and fat for each.

Rules for splitting the meal into items:
- A combined dish (sandwich, burger, wrap, burrito, salad, bowl, pizza, etc.) is ONE item. Its calories and macros must cover the whole dish, and its ingredients go in that item's "components" list.
- NEVER also list a dish's ingredients as separate items — every item's macros are added together, so doing so counts that food twice.
- Foods that are separate on the plate or served alongside (e.g. a side of fries, a piece of fruit, a drink) are their own items.
- For food made to be shared or sliced (a whole pizza, cake, pie), state the assumed size and slice count in "quantity", e.g. '1 whole 12" medium pizza (8 slices)'.

${ESTIMATION_GUIDELINES}`;

function normalizeFoodName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Safety net for the prompt rule above: drops any standalone single-food item
 * whose name matches a component of a combined dish in the same result (e.g.
 * "Cheddar cheese" returned alongside a sandwich listing "cheddar cheese"),
 * since the dish's totals already include it. Matching is deliberately
 * strict — exact name, or the component names that food as a whole word —
 * so genuine sides like "Cheese sauce" next to a burger with "cheese" survive.
 */
export function removeDuplicatedComponents(foods: MealPhotoFoodDraft[]): MealPhotoFoodDraft[] {
  const componentNames = foods.flatMap((f) => f.components.map(normalizeFoodName)).filter(Boolean);
  if (componentNames.length === 0) return foods;

  const kept = foods.filter((food) => {
    if (food.components.length > 0) return true;
    const name = normalizeFoodName(food.name);
    if (!name) return true;
    // Normalized names are space-separated words, so padding gives a whole-word match.
    return !componentNames.some((c) => c === name || ` ${c} `.includes(` ${name} `));
  });

  // Never hand back an empty draft list — fall back to the raw result.
  return kept.length > 0 ? kept : foods;
}

/**
 * Analyzes a meal photo with a vision-capable model and returns a draft list
 * of detected foods with estimated portions/macros. Combined dishes come back
 * as a single item (with their ingredients in `components`) so a meal's total
 * is the plain sum of its items. `note` is the user's free-text correction
 * when re-analyzing (e.g. "I only ate 2 slices"). The caller (client) is expected to review
 * and edit these before saving as NutritionLog entries — this function never
 * writes to the database itself.
 */
export async function analyzeMealPhoto(photoUrl: string, note?: string): Promise<MealPhotoFoodDraft[]> {
  const text = note
    ? `${MEAL_PHOTO_PROMPT}\n\nThe person who ate this meal added a note — follow it, especially about how much they actually ate:\n"${note}"`
    : MEAL_PHOTO_PROMPT;

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: mealPhotoSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image", image: photoUrl },
        ],
      },
    ],
  });

  return removeDuplicatedComponents(object.foods).map(reconcileCalories);
}

// ─── Text-Based Macro Estimation ─────────────────────────────────────────────
// (shared estimate schema/type, consumed by the batch estimator below)

const mealMacroEstimateSchema = z.object({
  calories: z.number().int().min(0).describe("Estimated calories for this food/serving"),
  proteinG: z.number().min(0).describe("Estimated grams of protein"),
  carbsG: z.number().min(0).describe("Estimated grams of carbohydrates"),
  fatG: z.number().min(0).describe("Estimated grams of fat"),
});

export type MealMacroEstimate = z.infer<typeof mealMacroEstimateSchema>;

const mealMacroBatchItemSchema = z.object({
  name: z.string(),
  quantity: z.string().optional(),
});

export type MealMacroBatchInput = z.infer<typeof mealMacroBatchItemSchema>;

const mealMacroBatchSchema = z.object({
  items: z
    .array(mealMacroEstimateSchema)
    .describe("One estimate per input item, in the same order as the input list"),
});

/**
 * Estimates macros for several food items in a single model call (e.g. "1 cup
 * coffee", "2 slices bread", "6 oz roasted chicken" logged together as one
 * meal), so each item gets its own distinct estimate. Never writes to the
 * database; the caller reviews/edits before saving.
 */
export async function estimateMealMacrosBatch(
  items: MealMacroBatchInput[]
): Promise<MealMacroEstimate[]> {
  if (items.length === 0) return [];

  const itemLines = items
    .map((item, i) => `${i + 1}. ${item.name}${item.quantity ? ` (serving size: "${item.quantity}")` : ""}`)
    .join("\n");

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: mealMacroBatchSchema,
    prompt: `Estimate the nutritional content of each of these food items, logged together as one meal:\n\n${itemLines}\n\n${ESTIMATION_GUIDELINES}\n\nReturn exactly ${items.length} estimate(s), in the same order as the input list.`,
  });

  if (object.items.length !== items.length) {
    throw new Error(`Expected ${items.length} macro estimates but received ${object.items.length}`);
  }

  return object.items.map(reconcileCalories);
}

/**
 * Re-estimates one photo-detected item after the user corrected what it is
 * or how much they ate (e.g. "Whole pizza" → "1 slice"). Sends the photo
 * along with the correction so the model keeps the visual context (toppings,
 * crust, preparation) while sizing the numbers to exactly the stated amount.
 * Never writes to the database.
 */
export async function reestimateMealPhotoItem(
  photoUrl: string,
  item: { name: string; quantity?: string; components?: string[] }
): Promise<MealMacroEstimate> {
  const details = [
    `Food: ${item.name}`,
    item.quantity ? `Amount actually eaten: ${item.quantity}` : null,
    item.components && item.components.length > 0 ? `Ingredients: ${item.components.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: mealMacroEstimateSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `This photo shows food someone ate. They corrected the details below — trust them over what the photo suggests, and estimate the nutrition for exactly the amount stated (not the whole dish in the photo unless that is what they say they ate). Use the photo only for what kind of food it is and how it was prepared.\n\n${details}\n\n${ESTIMATION_GUIDELINES}`,
          },
          { type: "image", image: photoUrl },
        ],
      },
    ],
  });

  return reconcileCalories(object);
}

// ─── Daily Summary ───────────────────────────────────────────────────────────

const dailySummarySchema = z.object({
  summary: z.string().describe("2-3 sentence encouraging but honest summary of the client's nutrition day"),
  highlight: z.string().describe("One specific thing that went well today"),
  concern: z.string().nullable().describe("One specific area to improve tomorrow, or null if nothing stands out"),
});

export type DailyNutritionSummary = z.infer<typeof dailySummarySchema>;

/**
 * Generates (or returns the cached) end-of-day AI summary for a client's
 * nutrition. Cached per calendar day in NutritionAiSummary; pass `force` to
 * regenerate.
 */
export async function generateDailyNutritionSummary(
  clientId: string,
  date: Date,
  force = false
): Promise<DailyNutritionSummary> {
  const periodStart = dayStart(date);

  if (!force) {
    const cached = await prisma.nutritionAiSummary.findUnique({
      where: { clientId_kind_periodStart: { clientId, kind: "DAILY", periodStart } },
    });
    if (cached) return cached.content as unknown as DailyNutritionSummary;
  }

  const summary = await nutritionService.getDailySummary(clientId, date);

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: dailySummarySchema,
    prompt: `You are a supportive nutrition coach reviewing a client's day. Here is today's data:

Calories: ${Math.round(summary.consumed.calories)} consumed${summary.target.calories ? ` / ${summary.target.calories} target` : " (no target set)"}
Protein: ${Math.round(summary.consumed.proteinG)}g consumed${summary.target.proteinG ? ` / ${summary.target.proteinG}g target` : " (no target set)"}
Carbs: ${Math.round(summary.consumed.carbsG)}g consumed${summary.target.carbsG ? ` / ${summary.target.carbsG}g target` : " (no target set)"}
Fat: ${Math.round(summary.consumed.fatG)}g consumed${summary.target.fatG ? ` / ${summary.target.fatG}g target` : " (no target set)"}
Water: ${Math.round(summary.consumed.waterMl)}ml consumed${summary.target.waterMl ? ` / ${summary.target.waterMl}ml target` : " (no target set)"}
Meals logged: ${summary.mealsLogged} (${summary.itemsLogged} food items in total — multiple items in one meal are a single meal)
Adherence: ${summary.adherencePct !== null ? `${summary.adherencePct}%` : "not enough data"}

Write a short, honest, encouraging summary of how the day went.`,
  });

  await prisma.nutritionAiSummary.upsert({
    where: { clientId_kind_periodStart: { clientId, kind: "DAILY", periodStart } },
    create: { clientId, kind: "DAILY", periodStart, content: object },
    update: { content: object },
  });

  return object;
}

// ─── Weekly Review ───────────────────────────────────────────────────────────

const weeklyReviewSchema = z.object({
  wins: z.array(z.string()).max(5).describe("Specific things the client did well this week"),
  struggles: z.array(z.string()).max(5).describe("Specific areas the client struggled with this week"),
  missedDays: z.number().int().min(0).max(7).describe("Number of days with zero meals logged"),
  coachingSuggestions: z.array(z.string()).max(5).describe("Actionable suggestions for the coach to relay to the client"),
  macroAdjustmentRecommendations: z
    .string()
    .describe("A short recommendation on whether/how to adjust calorie or macro targets next week"),
});

export type WeeklyNutritionReview = z.infer<typeof weeklyReviewSchema>;

/**
 * Generates (or returns the cached) weekly nutrition review for a client —
 * used for both the client-facing "weekly review" and the coach-facing
 * "weekly nutrition summary" surfaces in the doc, which share the same shape.
 *
 * Uses a trailing 7-day window ending on `referenceDate` (matching
 * computeWeeklyAccountabilityScore's windowing) rather than a calendar-week
 * start — deliberately avoids date-fns's local-timezone `startOfWeek`, which
 * previously caused today's data to fall outside the window whenever the
 * server's local timezone was ahead of UTC (the day-bucketing convention
 * used everywhere else in the nutrition module).
 *
 * Cached per day in NutritionAiSummary; pass `force` to regenerate.
 */
export async function generateWeeklyNutritionReview(
  clientId: string,
  referenceDate: Date,
  force = false
): Promise<WeeklyNutritionReview> {
  const periodStart = dayStart(referenceDate);

  if (!force) {
    const cached = await prisma.nutritionAiSummary.findUnique({
      where: { clientId_kind_periodStart: { clientId, kind: "WEEKLY", periodStart } },
    });
    if (cached) return cached.content as unknown as WeeklyNutritionReview;
  }

  const history = await nutritionService.getNutritionHistory(clientId, 7, referenceDate);
  const missedDaysCount = history.filter((p) => p.mealsLogged === 0).length;
  const avgAdherence = nutritionService.averageAdherence(history);

  const dayLines = history
    .map((p) => {
      const d = p.date.toISOString().slice(0, 10);
      return `- ${d}: ${p.mealsLogged} meals, ${Math.round(p.consumed.calories)} kcal, ${Math.round(p.consumed.proteinG)}g protein, adherence ${p.adherencePct ?? "n/a"}%`;
    })
    .join("\n");

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: weeklyReviewSchema,
    prompt: `You are a nutrition coach preparing a weekly review for a client based on the last 7 days of logged data:

${dayLines}

Average adherence this week: ${avgAdherence !== null ? `${avgAdherence}%` : "not enough data"}
Days with zero meals logged: ${missedDaysCount}

Write a concise weekly review: what went well (wins), what didn't (struggles), give the coach actionable suggestions to relay to the client, and recommend whether calorie/macro targets should be adjusted next week and how.`,
  });

  // missedDays is deterministic — trust our own count over the model's transcription of it.
  const result: WeeklyNutritionReview = { ...object, missedDays: missedDaysCount };

  await prisma.nutritionAiSummary.upsert({
    where: { clientId_kind_periodStart: { clientId, kind: "WEEKLY", periodStart } },
    create: { clientId, kind: "WEEKLY", periodStart, content: result },
    update: { content: result },
  });

  return result;
}
