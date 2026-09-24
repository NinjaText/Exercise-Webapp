/**
 * Notification type constants and categories.
 *
 * These live outside `notification.service.ts` so the registry can import them
 * without the service and the registry importing each other.
 */
export const NOTIFICATION_TYPES = {
  SESSION_REMINDER: "SESSION_REMINDER",
  CHECK_IN_DUE: "CHECK_IN_DUE",
  SESSION_COMPLETED: "SESSION_COMPLETED",
  MISSED_SESSION: "MISSED_SESSION",
  NEW_RESPONSE: "NEW_RESPONSE",
  NEW_MESSAGE: "NEW_MESSAGE",
  EXERCISE_NOTE: "EXERCISE_NOTE",
  NUTRITION_COMMENT: "NUTRITION_COMMENT",
  NUTRITION_REPLY: "NUTRITION_REPLY",
  NUTRITION_NUDGE_MEALS: "NUTRITION_NUDGE_MEALS",
  NUTRITION_NUDGE_PROTEIN: "NUTRITION_NUDGE_PROTEIN",
  NUTRITION_NUDGE_WATER: "NUTRITION_NUDGE_WATER",
  // Added by the email notification system.
  VOICE_MEMO: "VOICE_MEMO",
  FEEDBACK_RESPONSE: "FEEDBACK_RESPONSE",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  SUBSCRIPTION_CANCELED: "SUBSCRIPTION_CANCELED",
  REFUND_PROCESSED: "REFUND_PROCESSED",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * The four user-facing preference groups. These names are also the boolean
 * field names on `NotificationPreference`, which is what lets the dispatcher
 * check allowance with `prefs[entry.category]`.
 */
export type NotificationCategory = "sessions" | "messages" | "nutrition" | "billing";

/** Used in the email footer: "Unsubscribe from <label> emails". */
export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  sessions: "session",
  messages: "message",
  nutrition: "nutrition",
  billing: "billing",
};
