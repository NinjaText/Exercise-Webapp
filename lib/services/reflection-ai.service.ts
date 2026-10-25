import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  AI_PLAN_CHUNK_DAYS,
  AI_PLAN_MAX_DAYS,
  AI_SINGLE_OPTION_COUNT,
  REFLECTION_GUIDANCE_MAX,
  REFLECTION_KINDS,
  REFLECTION_TEXT_MAX,
  type ReflectionKind,
} from "@/lib/reflections/constants";

/**
 * AI-written reflections (same model + generateObject pattern as
 * nutrition-ai.service). Output is always original and unattributed: models
 * confidently invent quote attributions, so the schema has no author field
 * and the prompt forbids quoting real people.
 */

export interface ReflectionStyle {
  theme: string;
  tone: string;
  /** "MIXED" lets the model pick a kind per item. */
  kind: ReflectionKind | "MIXED";
  audience?: string | null;
  context?: string | null;
}

export interface GeneratedReflection {
  kind: ReflectionKind;
  text: string;
  guidance: string | null;
}

const generatedItemSchema = z.object({
  kind: z.enum(REFLECTION_KINDS).describe("QUOTE = short original saying, QUESTION = one open question, PROMPT = a journaling instruction"),
  text: z.string().describe("The reflection itself, one to two sentences"),
  guidance: z
    .string()
    .nullable()
    .describe("Optional one-sentence hint on how to reflect on it, or null"),
});

// Slack above the requested counts so a model that over-delivers by one or two
// is trimmed rather than failing validation; output tokens are capped too.
const optionsSchema = z.object({ options: z.array(generatedItemSchema).max(AI_SINGLE_OPTION_COUNT * 2) });
const OPTIONS_MAX_OUTPUT_TOKENS = 1200;
const PLAN_CHUNK_MAX_OUTPUT_TOKENS = 6000;

const planSchema = z.object({
  days: z
    .array(generatedItemSchema.extend({ dayNumber: z.number().int().describe("Day number this item is for") }))
    .max(AI_PLAN_CHUNK_DAYS + 10),
});

const SYSTEM_RULES = `You write daily reflections for clients of a fitness / physical therapy coach.
Rules:
- Everything you write is original. Never quote or name real people, books or brands.
- Keep each reflection to one or two short sentences (under 300 characters).
- Be supportive and practical; no medical advice, no diet or weight-loss pressure, no guilt.
- Plain language a client can answer in a minute or two.`;

function styleLines(style: ReflectionStyle): string {
  const kindLine =
    style.kind === "MIXED"
      ? "Kind: vary between QUOTE, QUESTION and PROMPT."
      : `Kind: every item must be a ${style.kind}.`;
  return [
    `Theme: ${style.theme}`,
    `Tone: ${style.tone}`,
    kindLine,
    style.audience ? `Audience: ${style.audience}` : null,
    style.context ? `Coach's extra context: ${style.context}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function clean(item: z.infer<typeof generatedItemSchema>, style: ReflectionStyle): GeneratedReflection | null {
  const text = item.text.trim().slice(0, REFLECTION_TEXT_MAX);
  if (!text) return null;
  const guidance = item.guidance?.trim().slice(0, REFLECTION_GUIDANCE_MAX) || null;
  // Honour a fixed kind even if the model drifted.
  const kind = style.kind === "MIXED" ? item.kind : style.kind;
  return { kind, text, guidance };
}

/** Three distinct options for the Create flow ("Use this" / "Regenerate"). */
export async function generateReflectionOptions(style: ReflectionStyle): Promise<GeneratedReflection[]> {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: optionsSchema,
    system: SYSTEM_RULES,
    maxOutputTokens: OPTIONS_MAX_OUTPUT_TOKENS,
    prompt: `Write ${AI_SINGLE_OPTION_COUNT} distinct daily reflection options.\n${styleLines(style)}\nMake each option clearly different from the others.`,
  });
  return object.options
    .map((item) => clean(item, style))
    .filter((item): item is GeneratedReflection => item !== null)
    .slice(0, AI_SINGLE_OPTION_COUNT);
}

/**
 * Generates reflections for specific program days (1-based), in chunks of
 * AI_PLAN_CHUNK_DAYS per model call, at most AI_PLAN_MAX_DAYS per request.
 * Days the model skipped are simply absent from the result.
 */
export async function generateProgramPlanReflections(input: {
  style: ReflectionStyle;
  dayNumbers: number[];
  totalDays: number;
  programName: string;
}): Promise<Array<GeneratedReflection & { dayNumber: number }>> {
  const dayNumbers = [...new Set(input.dayNumbers)].sort((a, b) => a - b).slice(0, AI_PLAN_MAX_DAYS);
  const results: Array<GeneratedReflection & { dayNumber: number }> = [];

  for (let start = 0; start < dayNumbers.length; start += AI_PLAN_CHUNK_DAYS) {
    const chunk = dayNumbers.slice(start, start + AI_PLAN_CHUNK_DAYS);
    const wanted = new Set(chunk);
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: planSchema,
      system: SYSTEM_RULES,
      maxOutputTokens: PLAN_CHUNK_MAX_OUTPUT_TOKENS,
      prompt: `Program: "${input.programName}" (${input.totalDays} days).
Write one daily reflection for each of these days: ${chunk.join(", ")}.
${styleLines(input.style)}
Let the reflections build gently over the program: early days about starting and settling in, middle days about consistency and noticing change, final days about progress and what comes next. Do not repeat yourself.`,
    });

    for (const item of object.days) {
      if (!wanted.has(item.dayNumber)) continue;
      const cleaned = clean(item, input.style);
      if (!cleaned) continue;
      wanted.delete(item.dayNumber);
      results.push({ ...cleaned, dayNumber: item.dayNumber });
    }
  }

  return results;
}
