import { z } from "zod";

// Validates the shape produced by lib/services/ai.service.ts's GeneratedProgram
// (flat sets: number / reps: string per exercise) — distinct from
// lib/validators/program.ts's createProgramSchema, which validates the manual
// builder's different nested-set-array shape and does not match this data.
export const generatedProgramExerciseSchema = z.object({
  exerciseId: z.string().min(1, "Exercise is required"),
  exerciseName: z.string().optional(),
  orderIndex: z.number().int().min(0),
  sets: z.number().int().min(1),
  reps: z.string().min(1),
  notes: z.string().optional(),
  restSeconds: z.number().int().min(0).optional(),
});

export const generatedProgramBlockSchema = z.object({
  type: z.string().min(1),
  name: z.string().optional(),
  circuitIndex: z.number().int().optional(),
  orderIndex: z.number().int().min(0),
  rounds: z.number().int().min(1).optional(),
  restBetweenRounds: z.number().int().min(0).nullable().optional(),
  exercises: z.array(generatedProgramExerciseSchema).min(1, "Each block needs at least one exercise"),
});

export const generatedProgramWorkoutSchema = z.object({
  name: z.string().min(1),
  dayIndex: z.number().int().min(0),
  weekIndex: z.number().int().min(0),
  blocks: z.array(generatedProgramBlockSchema).min(1, "Each workout needs at least one block"),
});

export const generatedProgramSchema = z.object({
  name: z.string().min(1, "Program name is required"),
  description: z.string().optional(),
  workouts: z.array(generatedProgramWorkoutSchema).min(1, "Program must include at least one workout"),
  warnings: z.array(z.string()).optional(),
});

export type GeneratedProgramInput = z.infer<typeof generatedProgramSchema>;
