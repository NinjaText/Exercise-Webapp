/**
 * `voice_note` is not derivable from a Message row — it marks a thread whose
 * newest item is a workout `VoiceMemo`. Callers pass that in explicitly (see
 * `InboxThreadPreview.lastItemIsVoiceNote`); `getMessageCategory` never
 * returns it.
 */
export type MessageCategory = "message" | "workout" | "exercise" | "voice_note";

/**
 * Derives an Inbox category badge from fields already on a Message row —
 * there is no explicit `kind` column, so this is inferred from context.
 */
export function getMessageCategory(message: {
  replyToExerciseName?: string | null;
  planId?: string | null;
}): Exclude<MessageCategory, "voice_note"> {
  if (message.replyToExerciseName) return "exercise";
  if (message.planId) return "workout";
  return "message";
}

export const MESSAGE_CATEGORY_LABEL: Record<MessageCategory, string> = {
  message: "Message",
  workout: "Workout",
  exercise: "Exercise",
  voice_note: "Voice Note",
};
