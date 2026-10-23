import { z } from "zod";
import { isYouTubeUrl } from "@/lib/utils/video";
import {
  FOLLOW_ALONG_CONTENT_FORMAT,
  MAX_FOLLOW_ALONG_DAYS,
  dayNumberFromIndices,
  getYouTubeVideoId,
} from "@/lib/utils/follow-along";

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

// --- Follow-along video ---

/**
 * A follow-along video is either an R2 upload (our public bucket URL) or a
 * YouTube link. https only — the client renders it in a <video>/iframe.
 */
export const followAlongVideoUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid video URL")
  .max(2048)
  .refine((url) => url.startsWith("https://"), "Video URL must use https")
  // Host-checked: only youtube.com / youtu.be / m. / nocookie links count as YouTube.
  .refine((url) => !isYouTubeUrl(url) || getYouTubeVideoId(url) !== null, "That YouTube link has no video in it");

// --- Workout schema ---
export const workoutSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, "Workout name is required").max(200),
    description: z.string().max(2000).optional().nullable(),
    dayIndex: z.number().int().min(0).max(6, "A week can have at most 7 days"),
    weekIndex: z.number().int().min(0).max(103, "Program can span at most 104 weeks").default(0),
    orderIndex: z.number().int().min(0),
    estimatedMinutes: z.number().int().positive().optional().nullable(),
    videoUrl: followAlongVideoUrlSchema.optional().nullable(),
    // Up to 12 hours — anything longer is a bad metadata read, not a workout.
    videoDurationSec: z.number().int().positive().max(12 * 60 * 60).optional().nullable(),
    blocks: z.array(workoutBlockSchema),
  })
  .superRefine((workout, ctx) => {
    // A video workout is played start to finish; exercise blocks alongside it
    // would never be shown to the client, so reject the ambiguous shape.
    if (workout.videoUrl && workout.blocks.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "A follow-along video day can't also have exercise blocks",
      });
    }
  });

/**
 * Follow-along rules that need the whole program: every day is a video (a
 * zero-block workout is only meaningful when it carries a videoUrl), and the
 * run is capped at MAX_FOLLOW_ALONG_DAYS. Plain programs keep allowing
 * zero-block workouts — the builder legitimately saves an empty day.
 * Exported so updateProgramAction can apply it when the stored program is
 * follow-along but the update payload omits contentFormat.
 */
export function getFollowAlongWorkoutIssues(
  workouts: { name: string; weekIndex: number; dayIndex: number; videoUrl?: string | null; blocks: unknown[] }[]
): { index: number; path: string; message: string }[] {
  const issues: { index: number; path: string; message: string }[] = [];
  const seenDays = new Set<number>();
  workouts.forEach((workout, index) => {
    const dayNumber = dayNumberFromIndices(workout.weekIndex, workout.dayIndex);
    if (dayNumber > MAX_FOLLOW_ALONG_DAYS) {
      issues.push({ index, path: "dayIndex", message: `A follow-along program can run at most ${MAX_FOLLOW_ALONG_DAYS} days` });
    }
    if (!workout.videoUrl) {
      issues.push({ index, path: "videoUrl", message: `Day ${dayNumber} needs a video (or mark it as a rest day)` });
    }
    if (seenDays.has(dayNumber)) {
      issues.push({ index, path: "dayIndex", message: `Day ${dayNumber} has more than one video` });
    }
    seenDays.add(dayNumber);
  });
  return issues;
}

function refineFollowAlongProgram(
  data: { contentFormat?: string | null; workouts?: Parameters<typeof getFollowAlongWorkoutIssues>[0] },
  ctx: z.RefinementCtx
) {
  if (data.contentFormat !== FOLLOW_ALONG_CONTENT_FORMAT || !data.workouts) return;
  for (const issue of getFollowAlongWorkoutIssues(data.workouts)) {
    ctx.addIssue({ code: "custom", path: ["workouts", issue.index, issue.path], message: issue.message });
  }
}

// --- Program schema ---

/**
 * SCHEDULED programs run on dates and pre-generate sessions. ON_DEMAND
 * ("Resources": warm-ups, mobility, recovery) have no schedule at all, so
 * startDate/daysPerWeek are meaningless for them.
 */
export const programSchedulingTypeSchema = z.enum(["SCHEDULED", "ON_DEMAND"]);

/**
 * Program fields with no defaults. The create schema layers its defaults on
 * top; the update schema uses these as-is (all optional), because zod still
 * applies a field's `.default()` inside `.partial()` — a partial update like
 * `{ name }` would otherwise come back with tags/collections/… = [] and
 * `workouts: []`, and updateProgram would write those (wiping the workouts).
 */
const programFields = {
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  isTemplate: z.boolean(),
  sourceTemplateId: z.string().optional().nullable(),
  programType: z.enum(["PERFORMANCE", "CLINICAL"]).optional().nullable(),
  durationWeeks: z.number().int().positive().optional().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  tags: z.array(z.string()),
  equipmentRequired: z.array(z.string()),
  organizationIds: z.array(z.string()),
  startDate: z.string().datetime().optional().nullable(),
  workouts: z.array(workoutSchema),
  collectionIds: z.array(z.string()),
  bodyAreas: z.array(z.string()),
  goals: z.array(z.string()),
  activities: z.array(z.string()),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional().nullable(),
  schedulingType: programSchedulingTypeSchema,
  // null → a normal exercise-based program; read via isFollowAlongProgram().
  contentFormat: z.enum([FOLLOW_ALONG_CONTENT_FORMAT]).optional().nullable(),
};

const createProgramBaseSchema = z.object({
  ...programFields,
  isTemplate: programFields.isTemplate.default(false),
  tags: programFields.tags.default([]),
  equipmentRequired: programFields.equipmentRequired.default([]),
  organizationIds: programFields.organizationIds.default([]),
  workouts: programFields.workouts.default([]),
  collectionIds: programFields.collectionIds.default([]),
  bodyAreas: programFields.bodyAreas.default([]),
  goals: programFields.goals.default([]),
  activities: programFields.activities.default([]),
  schedulingType: programFields.schedulingType.default("SCHEDULED"),
});

/**
 * The schedule fields stay optional for SCHEDULED programs (a library program
 * or draft legitimately has no start date until it's assigned), but they are
 * outright invalid on an ON_DEMAND program — a Resource has no schedule, and
 * storing one would make the Programs UI and the adherence maths lie.
 */
export const createProgramSchema = createProgramBaseSchema.superRefine((data, ctx) => {
  refineFollowAlongProgram(data, ctx);
  if (data.schedulingType !== "ON_DEMAND") return;

  if (data.startDate) {
    ctx.addIssue({
      code: "custom",
      path: ["startDate"],
      message: "On-demand resources don't have a start date",
    });
  }
  if (data.daysPerWeek != null) {
    ctx.addIssue({
      code: "custom",
      path: ["daysPerWeek"],
      message: "On-demand resources don't have a weekly schedule",
    });
  }
});

export const updateProgramSchema = z
  .object(programFields)
  .partial()
  .extend({
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
  })
  .superRefine(refineFollowAlongProgram);

// startDate is intentionally optional here: this schema can't know whether the
// target program is Scheduled (start date required) or On-Demand (no schedule
// at all), so assignProgramAction resolves the program first and enforces the
// requirement itself.
export const assignProgramSchema = z.object({
  programId: z.string().min(1),
  clientId: z.string().min(1),
  startDate: z.string().datetime().optional().nullable(),
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
  isFavorite: z.boolean().optional(),
  collectionId: z.string().optional(),
  // Recent = updated within the last 30 days.
  recentOnly: z.boolean().optional(),
  // Matches a program whose tags/bodyAreas/goals/activities include ANY of these.
  tags: z.array(z.string()).optional(),
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
