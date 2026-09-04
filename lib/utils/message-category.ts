export type MessageCategory = "message" | "workout" | "exercise";

/**
 * Derives an Inbox category badge from fields already on a Message row —
 * there is no explicit `kind` column, so this is inferred from context.
 */
export function getMessageCategory(message: {
  replyToExerciseName?: string | null;
  planId?: string | null;
}): MessageCategory {
  if (message.replyToExerciseName) return "exercise";
  if (message.planId) return "workout";
  return "message";
}

export const MESSAGE_CATEGORY_LABEL: Record<MessageCategory, string> = {
  message: "Message",
  workout: "Workout",
  exercise: "Exercise",
};
