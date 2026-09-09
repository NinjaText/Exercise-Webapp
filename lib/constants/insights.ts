/**
 * Dashboard AI-insight constants shared by client components, server actions
 * and the generating service.
 *
 * Lives in lib/constants (not the service layer) so client components can
 * import the kind list without pulling Prisma or the AI SDK into the browser
 * bundle; dashboard-ai-insights.service.ts re-exports it for server callers.
 */

/**
 * The closed set of insight categories the model may choose from. Drives the
 * generation schema, the dismissal validator, and the per-kind action buttons.
 */
export const INSIGHT_KINDS = [
  "pain_feedback",
  "inactive",
  "low_completion",
  "delayed_pattern",
  "program_ending",
  "progression_opportunity",
  "consistency_streak",
] as const;

export type InsightKind = (typeof INSIGHT_KINDS)[number];

/**
 * How long a dismissed dashboard AI insight stays suppressed.
 *
 * Shared by the insights API route (which filters) and the dismiss action
 * (which writes the record), so the two can never drift apart.
 */
export const DISMISSAL_WINDOW_DAYS = 14;
