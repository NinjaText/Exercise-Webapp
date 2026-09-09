import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  getClientSnapshots,
  computeCompletionRate,
  computeSessionStreak,
  computeVarianceBreakdown,
  getLastActivityAt,
} from "@/lib/services/dashboard-insights.service";
import { INSIGHT_KINDS, type InsightKind } from "@/lib/constants/insights";

/**
 * The decision-support shape of a dashboard insight.
 *
 * `what` / `why` / `action` are deliberately three separate one-sentence
 * fields rather than one blob: the card renders them as distinct lines so a
 * trainer can skim "what happened" and jump straight to the action button row
 * without reading the reasoning.
 */
export { INSIGHT_KINDS };
export type { InsightKind };

const insightSchema = z.object({
  insights: z
    .array(
      z.object({
        clientId: z
          .string()
          .describe("Copy the client's id VERBATIM from the provided data. Never invent one."),
        clientName: z.string().describe("The exact client name from the provided data"),
        kind: z.enum(INSIGHT_KINDS),
        what: z.string().describe("One sentence: what happened"),
        why: z.string().describe("One sentence: why it matters"),
        action: z.string().describe("One sentence: what the trainer should do next"),
        type: z.enum(["warning", "suggestion", "positive"]),
      })
    )
    .max(4),
});

type RawInsight = z.infer<typeof insightSchema>["insights"][number];

/** An insight after server-side validation, joined with its server-resolved program id. */
export interface CoachingInsight extends RawInsight {
  /** Resolved server-side from the client's active program — never taken from the model. */
  programId: string | null;
}

const AI_MODEL = "gpt-4o-mini";
const MAX_CLIENTS_IN_CONTEXT = 12;
const MAX_INSIGHTS = 4;
const DAY_MS = 1000 * 60 * 60 * 24;

export async function generateCoachingInsights(
  trainerId: string,
  now: Date = new Date()
): Promise<CoachingInsight[]> {
  try {
    const snapshots = await getClientSnapshots(trainerId, now);
    const active = snapshots.filter((s) => s.activeProgram || s.sessions.length > 0);
    if (active.length === 0) return [];

    const inContext = active.slice(0, MAX_CLIENTS_IN_CONTEXT);

    // The model is asked to echo clientId back, but an LLM can still hallucinate
    // or mangle an id — so keep an authoritative lookup to validate against and
    // to resolve the program link from, rather than trusting the response.
    const programIdByClientId = new Map<string, string | null>(
      inContext.map((s) => [s.clientId, s.activeProgram?.id ?? null])
    );

    const context = inContext
      .map((s) => {
        const { rate, scheduled } = computeCompletionRate(s.sessions, now);
        const variance = computeVarianceBreakdown(s.sessions, now);
        const streak = computeSessionStreak(s.sessions, now);
        const lastActivity = getLastActivityAt(s.sessions);
        const daysSince = lastActivity
          ? Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS)
          : null;
        const feedback = s.recentFeedback.map((f) => f.rating).join(", ") || "none";
        const completion = scheduled > 0 ? `${Math.round(rate * 100)}%` : "n/a";
        const varianceSummary = `${variance.onTime} on-time, ${variance.early} early, ${variance.delayed} delayed, ${variance.missed} missed`;
        return `- clientId=${s.clientId} | ${s.clientName}: program "${s.activeProgram?.name ?? "none"}", completion ${completion} over last 14d (${scheduled} scheduled: ${varianceSummary}), current streak ${streak}, days since last activity ${daysSince ?? "never"}, recent feedback: ${feedback}`;
      })
      .join("\n");

    const { object } = await generateObject({
      model: openai(AI_MODEL),
      schema: insightSchema,
      prompt: `You are an assistant coach for a physical-therapy and senior-fitness trainer. Based on the per-client data below, write 2-4 short, specific, decision-support insights.

Each insight has three one-sentence fields:
- "what": the concrete thing that happened, referencing the client by their exact name.
- "why": why that matters for this client's outcome.
- "action": the single next step the trainer should take.

Rules:
- "clientId" MUST be copied verbatim from the matching "clientId=" value below. Never invent, reformat, or guess an id.
- Pick the "kind" that best describes the insight: pain_feedback, inactive, low_completion, delayed_pattern, program_ending, progression_opportunity, consistency_streak.
- Use type "warning" for concerns (pain, inactivity, dropping adherence), "suggestion" for programming ideas (progress load, swap an exercise), and "positive" for clients doing well.
- "early" sessions are workouts a client completed ahead of schedule — this is not a sign of poor adherence, and can be a "positive" if notable. Only "delayed" and "missed" sessions indicate a client is falling behind their plan.
- Only the clients listed below exist. Do not invent data that is not present.

Client data:
${context}`,
    });

    // Drop anything the model attributed to an unknown client — a hallucinated
    // id would otherwise produce dead "Message Client" / "Review Program" links.
    return object.insights
      .filter((insight) => programIdByClientId.has(insight.clientId))
      .slice(0, MAX_INSIGHTS)
      .map((insight) => ({
        ...insight,
        programId: programIdByClientId.get(insight.clientId) ?? null,
      }));
  } catch (error) {
    console.error("Failed to generate AI coaching insights:", error);
    return [];
  }
}
