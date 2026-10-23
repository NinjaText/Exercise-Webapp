import { z } from "zod";
import {
  AI_AUDIENCE_MAX,
  AI_CONTEXT_MAX,
  JOURNAL_BODY_MAX,
  MAX_FANOUT_ROWS,
  MAX_PROGRAM_PLAN_DAYS,
  MAX_RECURRING_SPAN_DAYS,
  REFLECTION_AUTHOR_MAX,
  REFLECTION_GUIDANCE_MAX,
  REFLECTION_IMAGE_MAX_BYTES,
  REFLECTION_IMAGE_TYPES,
  REFLECTION_KINDS,
  REFLECTION_SOURCES,
  REFLECTION_TEXT_MAX,
  REFLECTION_THEME_MAX,
  REFLECTION_TONES,
} from "@/lib/reflections/constants";
import { isValidDateKey, parseDateKey, utcDaysBetween } from "@/lib/reflections/dates";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

/** Trimmed optional text: blank → null so "no author" is stored consistently. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
}

const dateKey = z.string().refine(isValidDateKey, "Invalid date");

// ─── Reflection content ──────────────────────────────────────────────────────

export const reflectionContentSchema = z.object({
  kind: z.enum(REFLECTION_KINDS),
  text: z.string().trim().min(1, "Reflection text is required").max(REFLECTION_TEXT_MAX),
  author: optionalText(REFLECTION_AUTHOR_MAX),
  guidance: optionalText(REFLECTION_GUIDANCE_MAX),
  theme: optionalText(REFLECTION_THEME_MAX),
  /** Only URLs minted by our own upload action are accepted (checked server-side). */
  imageUrl: z.string().url().max(500).nullish().transform((value) => value ?? null),
  source: z.enum(REFLECTION_SOURCES),
  allowJournal: z.boolean(),
  allowShare: z.boolean(),
});

export type ReflectionContentInput = z.infer<typeof reflectionContentSchema>;

// ─── Scheduling ──────────────────────────────────────────────────────────────

const singleScheduleSchema = z.object({ mode: z.literal("single"), date: dateKey });

const recurringScheduleSchema = z
  .object({
    mode: z.literal("recurring"),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one weekday").max(7),
    startDate: dateKey,
    endDate: dateKey,
  })
  .superRefine((value, ctx) => {
    const start = parseDateKey(value.startDate);
    const end = parseDateKey(value.endDate);
    if (!start || !end) return;
    const span = utcDaysBetween(start, end);
    if (span < 0) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
    } else if (span + 1 > MAX_RECURRING_SPAN_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: `A recurring schedule can span at most ${MAX_RECURRING_SPAN_DAYS} days`,
      });
    }
  });

export const scheduleSchema = z.discriminatedUnion("mode", [singleScheduleSchema, recurringScheduleSchema]);

const clientTargetSchema = z
  .object({
    type: z.literal("clients"),
    audience: z.enum(["all", "selected"]),
    clientIds: z.array(objectId).max(MAX_FANOUT_ROWS).default([]),
    schedule: scheduleSchema,
  })
  .refine((value) => value.audience === "all" || value.clientIds.length > 0, {
    message: "Select at least one client",
    path: ["clientIds"],
  });

const programTargetSchema = z.object({
  type: z.literal("program"),
  programId: objectId,
  dayNumber: z.number().int().min(1).max(MAX_PROGRAM_PLAN_DAYS),
});

export const reflectionTargetSchema = z.union([clientTargetSchema, programTargetSchema]);
export type ReflectionTargetInput = z.infer<typeof reflectionTargetSchema>;

export const createReflectionSchema = z.object({
  content: reflectionContentSchema,
  target: reflectionTargetSchema,
});
export type CreateReflectionInput = z.infer<typeof createReflectionSchema>;

/** Edits apply to every row of a scheduled group at once (they share content). */
export const updateReflectionsSchema = z.object({
  ids: z.array(objectId).min(1).max(MAX_FANOUT_ROWS),
  content: reflectionContentSchema,
});

export const deleteReflectionsSchema = z.object({
  ids: z.array(objectId).min(1).max(MAX_FANOUT_ROWS),
});

// ─── Program plans ───────────────────────────────────────────────────────────

export const programDaySchema = z.object({
  programId: objectId,
  dayNumber: z.number().int().min(1).max(MAX_PROGRAM_PLAN_DAYS),
});

export const upsertProgramDaySchema = programDaySchema.extend({ content: reflectionContentSchema });

export const programIdSchema = z.object({ programId: objectId });

// ─── AI generation ───────────────────────────────────────────────────────────

const aiStyleFields = {
  theme: z.string().trim().min(1, "Pick a theme").max(REFLECTION_THEME_MAX),
  tone: z.enum(REFLECTION_TONES),
  /** "MIXED" lets the model choose a kind per option/day. */
  kind: z.enum([...REFLECTION_KINDS, "MIXED"] as const),
  audience: optionalText(AI_AUDIENCE_MAX),
  context: optionalText(AI_CONTEXT_MAX),
};

export const generateReflectionOptionsSchema = z.object(aiStyleFields);
export type GenerateReflectionOptionsInput = z.infer<typeof generateReflectionOptionsSchema>;

export const fillProgramPlanSchema = z.object({ programId: objectId, ...aiStyleFields });
export type FillProgramPlanInput = z.infer<typeof fillProgramPlanSchema>;

// ─── Image upload ────────────────────────────────────────────────────────────

export const reflectionImagePresignSchema = z.object({
  contentType: z.enum(REFLECTION_IMAGE_TYPES),
  fileSize: z.number().int().min(1).max(REFLECTION_IMAGE_MAX_BYTES, "Images must be 5 MB or smaller"),
});

// ─── Journal ─────────────────────────────────────────────────────────────────

const journalBody = z.string().trim().min(1, "Write something first").max(JOURNAL_BODY_MAX);

/** Answer to today's reflection — the prompt itself is resolved server-side, never trusted from the client. */
export const todaysReflectionEntrySchema = z
  .object({
    body: journalBody,
    visibility: z.enum(["PRIVATE", "SHARED"]),
    /** The client's local day the card was rendered for. */
    dateKey,
    /** Exactly one of these identifies the reflection the card showed. */
    reflectionId: objectId.nullable(),
    libraryId: z.string().max(60).nullable(),
  })
  .refine((value) => Boolean(value.reflectionId) !== Boolean(value.libraryId), {
    message: "Invalid reflection",
    path: ["reflectionId"],
  });

/** Card data for the client's local day. */
export const todaysReflectionCardSchema = z.object({ dateKey });

export const freeJournalEntrySchema = z.object({ body: journalBody, dateKey: dateKey.optional() });

export const updateJournalEntrySchema = z.object({ id: objectId, body: journalBody });

export const journalEntryIdSchema = z.object({ id: objectId });
