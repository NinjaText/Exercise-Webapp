import { z } from "zod"

export const NUTRITION_TARGET_FIELDS = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "waterMl",
  "mealsPerDayTarget",
] as const

export type NutritionTargetField = (typeof NUTRITION_TARGET_FIELDS)[number]

export const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const

const ALLOWED_PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const

export const upsertNutritionTargetSchema = z.object({
  clientId: z.string().min(1),
  calories: z.number().int().min(0).max(20000).nullable().optional(),
  proteinG: z.number().int().min(0).max(2000).nullable().optional(),
  carbsG: z.number().int().min(0).max(4000).nullable().optional(),
  fatG: z.number().int().min(0).max(2000).nullable().optional(),
  fiberG: z.number().int().min(0).max(500).nullable().optional(),
  waterMl: z.number().int().min(0).max(20000).nullable().optional(),
  mealsPerDayTarget: z.number().int().min(1).max(12).nullable().optional(),
  clientEditableFields: z.array(z.enum(NUTRITION_TARGET_FIELDS)).optional(),
})

export const createNutritionLogSchema = z.object({
  clientId: z.string().min(1),
  date: z.coerce.date(),
  mealType: z.enum(MEAL_TYPES),
  description: z.string().min(1).max(200),
  quantity: z.string().max(100).optional(),
  loggedAt: z.coerce.date().optional(),
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  proteinG: z.number().min(0).max(2000).nullable().optional(),
  carbsG: z.number().min(0).max(2000).nullable().optional(),
  fatG: z.number().min(0).max(2000).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
})

export const updateNutritionLogSchema = createNutritionLogSchema
  .omit({ clientId: true, date: true })
  .partial()

export const addWaterLogSchema = z.object({
  clientId: z.string().min(1),
  date: z.coerce.date(),
  amountMl: z.number().int().min(1).max(10000),
})

export const createNutritionCommentSchema = z.object({
  clientId: z.string().min(1),
  date: z.coerce.date(),
  logId: z.string().min(1).optional(),
  body: z.string().min(1).max(2000),
})

export const mealPhotoPresignSchema = z.object({
  fileExtension: z.enum(ALLOWED_PHOTO_EXTENSIONS),
})

export const mealPhotoConfirmSchema = z.object({
  pendingKey: z
    .string()
    .regex(/^nutrition-photos\/pending\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/),
})

export const analyzeMealPhotoSchema = z.object({
  photoUrl: z.string().url(),
})

export const bulkCreateNutritionLogSchema = z.object({
  clientId: z.string().min(1),
  date: z.coerce.date(),
  mealType: z.enum(MEAL_TYPES),
  logs: z
    .array(
      z.object({
        description: z.string().min(1).max(200),
        quantity: z.string().max(100).optional(),
        calories: z.number().int().min(0).max(10000).nullable().optional(),
        proteinG: z.number().min(0).max(2000).nullable().optional(),
        carbsG: z.number().min(0).max(2000).nullable().optional(),
        fatG: z.number().min(0).max(2000).nullable().optional(),
        photoUrl: z.string().url().nullable().optional(),
      })
    )
    .min(1)
    .max(20),
})

export const generateDailySummarySchema = z.object({
  clientId: z.string().min(1),
  date: z.coerce.date(),
  force: z.boolean().optional(),
})

export const generateWeeklyReviewSchema = z.object({
  clientId: z.string().min(1),
  referenceDate: z.coerce.date(),
  force: z.boolean().optional(),
})
