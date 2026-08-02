import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import * as nutritionService from "@/lib/services/nutrition.service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Meal Photo Analysis ─────────────────────────────────────────────────────

const mealPhotoSchema = z.object({
  foods: z
    .array(
      z.object({
        name: z.string().describe("Food item name, e.g. 'Grilled chicken breast'"),
        quantity: z.string().describe("Estimated serving size, e.g. '6 oz' or '1 cup'"),
        calories: z.number().int().min(0).describe("Estimated calories for this item"),
        proteinG: z.number().min(0).describe("Estimated grams of protein"),
        carbsG: z.number().min(0).describe("Estimated grams of carbohydrates"),
        fatG: z.number().min(0).describe("Estimated grams of fat"),
      })
    )
    .min(1)
    .max(10),
});

export type MealPhotoFoodDraft = z.infer<typeof mealPhotoSchema>["foods"][number];

/**
 * Analyzes a meal photo with a vision-capable model and returns a draft list
 * of detected foods with estimated portions/macros. The caller (client) is
 * expected to review and edit these before saving as NutritionLog entries —
 * this function never writes to the database itself.
 */
export async function analyzeMealPhoto(photoUrl: string): Promise<MealPhotoFoodDraft[]> {
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: mealPhotoSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Identify each distinct food item in this meal photo. For each, estimate a realistic serving size and its calories, protein, carbs, and fat. Be a reasonable, conservative estimator — these are draft values a person will review and correct before saving.",
          },
          { type: "image", image: photoUrl },
        ],
      },
    ],
  });

  return object.foods;
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
    prompt: `Estimate the nutritional content of each of these food items, logged together as one meal:\n\n${itemLines}\n\nBe a reasonable, conservative estimator based on typical preparation and portion sizes — these are draft values a person will review and can correct before saving. Return exactly ${items.length} estimate(s), in the same order as the input list.`,
  });

  if (object.items.length !== items.length) {
    throw new Error(`Expected ${items.length} macro estimates but received ${object.items.length}`);
  }

  return object.items;
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
Meals logged: ${summary.mealsLogged}
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
