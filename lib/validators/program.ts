import { z } from "zod";

// --- Set schema ---
export const exerciseSetSchema = z.object({
  id: z.string().optional(),
  orderIndex: z.number().int().min(0),
  setType: z.enum(["NORMAL", "WARMUP", "DROP_SET", "FAILURE", "WORK", "RECOVERY", "COOLDOWN"]).default("NORMAL"),
  targetReps: z.number().int().positive().optional().nullable(),
  targetWeight: z.number().positive().optional().nullable(),
  targetDuration: z.number().int().positive().optional().nullable(),
  targetDurationUnit: z.enum(["SEC", "MIN"]).optional().nullable(),
  targetDistance: z.number().positive().optional().nullable(),
  targetPace: z.string().max(50).optional().nullable(),
  targetHrZone: z.string().max(50).optional().nullable(),
  repeatCount: z.number().int().positive().optional().nullable(),
  targetRPE: z.number().int().min(1).max(10).optional().nullable(),
  restAfter: z.number().int().min(0).optional().nullable(),
});

// --- Block exercise schema ---
export const blockExerciseSchema = z.object({
  id: z.string().optional(),
  exerciseId: z.string().min(1, "Exercise is required"),
  orderIndex: z.number().int().min(0),
  activityType: z.enum(["STRENGTH", "RUN", "INTERVAL_RUN"]).default("STRENGTH"),
  restSeconds: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  supersetGroup: z.string().optional().nullable(),
  sets: z.array(exerciseSetSchema).min(1, "At least one set is required"),
});

// --- Block schema ---
export const workoutBlockSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(100).optional().nullable(),
  type: z.enum(["NORMAL", "WARMUP", "COOLDOWN", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM"]).default("NORMAL"),
  orderIndex: z.number().int().min(0),
  rounds: z.number().int().min(1).default(1),
  restBetweenRounds: z.number().int().min(0).optional().nullable(),
  timeCap: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  exercises: z.array(blockExerciseSchema),
});

// --- Workout schema ---
export const workoutSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Workout name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  dayIndex: z.number().int().min(0).max(6, "A week can have at most 7 days"),
  weekIndex: z.number().int().min(0).max(103, "Program can span at most 104 weeks").default(0),
  orderIndex: z.number().int().min(0),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
  blocks: z.array(workoutBlockSchema),
});

// --- Program schema ---
export const createProgramSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  isTemplate: z.boolean().default(false),
  sourceTemplateId: z.string().optional().nullable(),
  programType: z.enum(["PERFORMANCE", "CLINICAL"]).optional().nullable(),
  durationWeeks: z.number().int().positive().optional().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  tags: z.array(z.string()).default([]),
  equipmentRequired: z.array(z.string()).default([]),
  organizationIds: z.array(z.string()).default([]),
  startDate: z.string().datetime().optional().nullable(),
  workouts: z.array(workoutSchema).default([]),
});

export const updateProgramSchema = createProgramSchema.partial().extend({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
});

export const assignProgramSchema = z.object({
  programId: z.string().min(1),
  clientId: z.string().min(1),
  startDate: z.string().datetime(),
});

export const programFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
  isTemplate: z.boolean().optional(),
  clientId: z.string().optional(),
  // Whether the program currently has a client attached — used to split the
  // programs list into "Assigned" (a client is running it) vs "Library"
  // (not yet given to anyone: drafts and reusable templates alike).
  hasClient: z.boolean().optional(),
});

// --- Inferred types ---
export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
export type AssignProgramInput = z.infer<typeof assignProgramSchema>;
export type ProgramFilterInput = z.infer<typeof programFilterSchema>;
export type WorkoutInput = z.infer<typeof workoutSchema>;
export type WorkoutBlockInput = z.infer<typeof workoutBlockSchema>;
export type BlockExerciseInput = z.infer<typeof blockExerciseSchema>;
export type ExerciseSetInput = z.infer<typeof exerciseSetSchema>;
