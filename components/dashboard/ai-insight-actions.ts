import type { InsightKind } from "@/lib/constants/insights";

/**
 * The decision-support actions offered per insight kind.
 *
 * Kept as data (rather than branching in JSX) so the "what can I do about
 * this?" mapping stays reviewable in one place and a new insight kind is a
 * one-line change.
 */
export type InsightActionKey = "message_client" | "review_program" | "adjust_workout" | "dismiss";

export const ACTIONS_BY_INSIGHT_KIND: Record<InsightKind, InsightActionKey[]> = {
  pain_feedback: ["message_client", "adjust_workout", "dismiss"],
  inactive: ["message_client", "review_program", "dismiss"],
  low_completion: ["message_client", "review_program", "dismiss"],
  delayed_pattern: ["message_client", "review_program", "dismiss"],
  program_ending: ["review_program", "message_client", "dismiss"],
  progression_opportunity: ["adjust_workout", "review_program", "dismiss"],
  consistency_streak: ["message_client", "dismiss"],
};

export interface InsightActionTarget {
  clientId: string;
  programId: string | null;
}

export interface InsightActionConfig {
  label: string;
  /**
   * `null` means the action can't be offered for this insight (e.g. a program
   * link when the client has no active program) and is filtered out.
   * "Dismiss" has no href — it runs the dismiss server action instead.
   */
  href: ((target: InsightActionTarget) => string | null) | null;
}

export const INSIGHT_ACTION_CONFIG: Record<InsightActionKey, InsightActionConfig> = {
  // The trainer inbox opens a thread by the *other* user's id at
  // /messages/{clientId} — same route the priority-alert "Message" button uses.
  message_client: {
    label: "Message Client",
    href: ({ clientId }) => `/messages/${clientId}`,
  },
  review_program: {
    label: "Review Program",
    href: ({ programId }) => (programId ? `/programs/${programId}` : null),
  },
  adjust_workout: {
    label: "Adjust Workout",
    href: ({ programId }) => (programId ? `/programs/${programId}/edit` : null),
  },
  dismiss: { label: "Dismiss", href: null },
};
