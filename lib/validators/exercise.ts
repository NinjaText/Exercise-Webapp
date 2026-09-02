import { z } from "zod";

export const createExerciseSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  bodyRegion: z.array(z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"])).min(1, "Select at least one body region"),
  equipmentRequired: z.array(z.string()).default([]),
  difficultyLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  contraindications: z.array(z.string()).default([]),
  instructions: z.string().max(5000).optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  videoProvider: z.string().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
  isAssessment: z.boolean().optional().default(false),
});

export const updateExerciseSchema = createExerciseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const exerciseFilterSchema = z.object({
  search: z.string().optional(),
  bodyRegion: z.array(z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"])).optional(),
  difficultyLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  equipment: z.string().optional(),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
export type ExerciseFilterInput = z.infer<typeof exerciseFilterSchema>;
