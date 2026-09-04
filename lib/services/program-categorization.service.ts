import OpenAI from "openai";
import { z } from "zod";
import type { GeneratedProgram } from "@/lib/services/ai.service";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const programCategorizationSchema = z.object({
  bodyAreas: z.array(z.string()).max(6).default([]),
  goals: z.array(z.string()).max(6).default([]),
  activities: z.array(z.string()).max(4).default([]),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable().default(null),
  tags: z.array(z.string()).max(8).default([]),
});

export type ProgramCategorization = z.infer<typeof programCategorizationSchema>;

export interface ProgramCategorizationContext {
  programGoals?: string[];
  difficultyLevel?: string;
  availableEquipment?: string[];
  trainerPrompt?: string;
  circuits?: { focusType?: string }[];
}

const CIRCUIT_FOCUS_TO_BODY_AREA: Record<string, string> = {
  LOWER_BODY: "Lower Body",
  UPPER_BODY: "Upper Body",
  CORE: "Core",
  FULL_BODY: "Full Body",
  BALANCE: "Balance",
  FLEXIBILITY: "Flexibility/Mobility",
};

const VALID_LEVELS = new Set(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);

/**
 * Rule-based categorization from what the trainer already selected — used both
 * as the primary result when the AI call fails and as ground truth the AI
 * result gets reconciled against (see categorizeGeneratedProgram).
 */
function deterministicCategorization(context: ProgramCategorizationContext): ProgramCategorization {
  const level = context.difficultyLevel && VALID_LEVELS.has(context.difficultyLevel)
    ? (context.difficultyLevel as ProgramCategorization["level"])
    : null;

  const bodyAreas = Array.from(new Set(
    (context.circuits ?? [])
      .map((c) => (c.focusType ? CIRCUIT_FOCUS_TO_BODY_AREA[c.focusType] : undefined))
      .filter((v): v is string => !!v)
  ));

  return {
    level,
    goals: context.programGoals ?? [],
    bodyAreas,
    activities: [],
    tags: [],
  };
}

/**
 * Reads the categorization-relevant fields out of the loosely-typed
 * `aiGenerationParams` blob every generation path already stores — the
 * trainer-facing form sends `programGoals`, the brief-upload flow sends
 * `focusAreas` instead, so both are checked.
 */
export function buildCategorizationContextFromParams(
  params: Record<string, unknown>
): ProgramCategorizationContext {
  const goals = Array.isArray(params.programGoals)
    ? (params.programGoals as unknown[]).filter((v): v is string => typeof v === "string")
    : Array.isArray(params.focusAreas)
      ? (params.focusAreas as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

  const availableEquipment = Array.isArray(params.availableEquipment)
    ? (params.availableEquipment as unknown[]).filter((v): v is string => typeof v === "string" && v !== "none")
    : [];

  const circuits = Array.isArray(params.circuits)
    ? (params.circuits as unknown[])
        .map((c) => (c && typeof c === "object" && "focusType" in c ? { focusType: String((c as { focusType: unknown }).focusType) } : undefined))
        .filter((v): v is { focusType: string } => !!v)
    : [];

  return {
    programGoals: goals,
    difficultyLevel: typeof params.difficultyLevel === "string" ? params.difficultyLevel : undefined,
    availableEquipment,
    trainerPrompt: typeof params.trainerPrompt === "string" ? params.trainerPrompt : undefined,
    circuits,
  };
}

/**
 * Asks a small model to label a freshly-generated program with the same
 * category fields the manual program editor lets a trainer set (bodyAreas,
 * goals, activities, level, tags), grounded in the trainer's own selections
 * so it never contradicts an explicit choice — it only fills in the gaps
 * (specific body areas, activities/sport fit, descriptive tags) that have no
 * deterministic source. Falls back to a rule-based result on any failure so a
 * flaky call never blocks program creation.
 */
export async function categorizeGeneratedProgram(
  plan: GeneratedProgram,
  context: ProgramCategorizationContext
): Promise<ProgramCategorization> {
  const fallback = deterministicCategorization(context);

  try {
    const exerciseNames = Array.from(new Set(
      plan.workouts.flatMap((w) =>
        w.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseName).filter((n): n is string => !!n))
      )
    )).slice(0, 60);

    const systemPrompt = `You label fitness/rehab programs with short, searchable categorization tags for a trainer's program library. Respond with strict JSON only, matching the requested shape exactly.`;

    const userPrompt = `Program name: ${plan.name}
Description: ${plan.description || "(none)"}
Exercises used: ${exerciseNames.length ? exerciseNames.join(", ") : "(none listed)"}

Known trainer-selected values — treat these as ground truth, carry them through as-is:
- Goals: ${context.programGoals?.length ? context.programGoals.join(", ") : "(none specified)"}
- Difficulty level: ${context.difficultyLevel || "(not specified)"}
- Equipment: ${context.availableEquipment?.length ? context.availableEquipment.join(", ") : "(not specified)"}
${context.trainerPrompt ? `- Trainer instructions: ${context.trainerPrompt}` : ""}

Respond with this exact JSON shape:
{
  "bodyAreas": string[],   // 1-5 specific body areas actually targeted by the exercises above (e.g. "Shoulder", "Knee", "Core", "Hip") — infer from the exercise list, don't just repeat "Full Body"
  "goals": string[],       // the trainer's goals above, carried through verbatim; add at most one more only if clearly evident from the exercises
  "activities": string[],  // 0-3 sports/activities this program suits (e.g. "Running", "Tennis"); empty array if it's general fitness
  "level": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",  // use the trainer's difficulty level above unless the exercises clearly indicate otherwise
  "tags": string[]         // 2-6 short descriptive tags useful for filtering (e.g. "low-impact", "post-surgery", "home-workout", "progressive-overload")
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const validated = programCategorizationSchema.safeParse(JSON.parse(raw));

    if (!validated.success) {
      console.warn("[program-categorization] Invalid AI output, using deterministic fallback:", validated.error.issues);
      return fallback;
    }

    return {
      bodyAreas: validated.data.bodyAreas.length ? validated.data.bodyAreas : fallback.bodyAreas,
      goals: validated.data.goals.length ? validated.data.goals : fallback.goals,
      activities: validated.data.activities,
      level: validated.data.level ?? fallback.level,
      tags: validated.data.tags,
    };
  } catch (error) {
    console.error("[program-categorization] AI categorization failed, using deterministic fallback:", error);
    return fallback;
  }
}
