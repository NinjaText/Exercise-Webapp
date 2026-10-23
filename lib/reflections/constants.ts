/**
 * Daily reflections + journal — shared vocabulary and limits.
 *
 * Client-safe (no Prisma): the trainer stepper, the dashboard card, the
 * validators and the services all import from here so a limit only ever
 * changes in one place.
 */

export const REFLECTION_KINDS = ["QUOTE", "QUESTION", "PROMPT"] as const;
export type ReflectionKind = (typeof REFLECTION_KINDS)[number];

export const REFLECTION_KIND_LABELS: Record<ReflectionKind, string> = {
  QUOTE: "Quote",
  QUESTION: "Question",
  PROMPT: "Prompt",
};

export const REFLECTION_SOURCES = ["CUSTOM", "AI", "LIBRARY"] as const;
export type ReflectionSource = (typeof REFLECTION_SOURCES)[number];

export const REFLECTION_THEMES = [
  "Consistency",
  "Mindset",
  "Recovery",
  "Gratitude",
  "Discipline",
  "Self-care",
  "Progress",
  "Motivation",
] as const;
export type ReflectionTheme = (typeof REFLECTION_THEMES)[number];

export const REFLECTION_TONES = ["Encouraging", "Calm", "Direct", "Reflective", "Playful"] as const;
export type ReflectionTone = (typeof REFLECTION_TONES)[number];

export const JOURNAL_VISIBILITIES = ["PRIVATE", "SHARED"] as const;
export type JournalVisibility = (typeof JOURNAL_VISIBILITIES)[number];

/** Weekday numbers follow Date#getUTCDay (0 = Sunday). Displayed Monday-first. */
export const WEEKDAY_OPTIONS = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
  { value: 0, short: "Sun" },
] as const;

// ─── Limits ──────────────────────────────────────────────────────────────────

export const REFLECTION_TEXT_MAX = 500;
export const REFLECTION_AUTHOR_MAX = 120;
export const REFLECTION_GUIDANCE_MAX = 500;
export const REFLECTION_THEME_MAX = 40;
/** Same ceiling as a chat message, since a shared entry becomes one. */
export const JOURNAL_BODY_MAX = 5000;

/** One save never writes more than this many client-dated rows. */
export const MAX_FANOUT_ROWS = 2000;
/** A recurring schedule may span at most this many days (inclusive). */
export const MAX_RECURRING_SPAN_DAYS = 180;
/** Program plans address days 1..N; nothing longer is supported. */
export const MAX_PROGRAM_PLAN_DAYS = 365;

/** AI inputs are capped so a pasted essay can't blow up the prompt. */
export const AI_CONTEXT_MAX = 500;
export const AI_AUDIENCE_MAX = 120;
/** Program-plan generation: hard cap per request, and per model call. */
export const AI_PLAN_MAX_DAYS = 120;
export const AI_PLAN_CHUNK_DAYS = 30;
/** Single mode always offers this many options (mockup: 3 cards). */
export const AI_SINGLE_OPTION_COUNT = 3;

/** Reflection images: R2 key prefix, allowed types and size ceiling. */
export const REFLECTION_IMAGE_PREFIX = "reflections";
export const REFLECTION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReflectionImageType = (typeof REFLECTION_IMAGE_TYPES)[number];
export const REFLECTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
