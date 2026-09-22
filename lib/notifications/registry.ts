import type * as React from "react";
import {
  NOTIFICATION_TYPES,
  type NotificationCategory,
  type NotificationType,
} from "./types";
import { SessionReminderEmail } from "@/lib/email/templates/session-reminder";
import { SessionCompletedEmail } from "@/lib/email/templates/session-completed";
import { MissedSessionEmail } from "@/lib/email/templates/missed-session";
import { VoiceMemoAddedEmail } from "@/lib/email/templates/voice-memo-added";
import { NewMessageEmail } from "@/lib/email/templates/new-message";
import { ExerciseNoteEmail } from "@/lib/email/templates/exercise-note";
import { CheckInAssignedEmail } from "@/lib/email/templates/check-in-assigned";
import { CheckInResponseEmail } from "@/lib/email/templates/check-in-response";
import { FeedbackResponseEmail } from "@/lib/email/templates/feedback-response";
import { NutritionCommentEmail } from "@/lib/email/templates/nutrition-comment";
import { NutritionNudgeEmail } from "@/lib/email/templates/nutrition-nudge";
import { PaymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { SubscriptionCanceledEmail } from "@/lib/email/templates/subscription-canceled";
import { RefundProcessedEmail } from "@/lib/email/templates/refund-processed";

/**
 * Templates each declare their own prop interface, but the dispatcher assembles
 * props dynamically from `notifyUser`'s `email` payload, so the registry erases
 * the prop type. `tpl()` is the one place that erasure happens.
 *
 * The trade-off: a missing prop is a runtime `undefined` in an email body, not
 * a compile error. The per-type call-site tests in Tasks 9–11 assert the
 * payload keys for exactly this reason.
 */
export type EmailTemplate = (props: Record<string, unknown>) => React.ReactElement;

export function tpl<P>(component: (props: P) => React.ReactElement): EmailTemplate {
  return component as unknown as EmailTemplate;
}

export interface RegistryEntry {
  category: NotificationCategory;
  /** Transactional mail ignores preferences and carries no unsubscribe link. */
  transactional: boolean;
  /** `null` means in-app only — a deliberate, permanent state. */
  template: EmailTemplate | null;
  subject: (data: Record<string, unknown>) => string;
  /** Minutes. `null` means no cap. */
  cooldownMinutes: number | null;
}

export const NOTIFICATION_REGISTRY: Record<NotificationType, RegistryEntry> = {
  // ── Sessions ──────────────────────────────────────────────────────────────
  [NOTIFICATION_TYPES.SESSION_REMINDER]: {
    category: "sessions",
    transactional: false,
    template: tpl(SessionReminderEmail),
    // `app/api/reminders/route.ts` already dedupes per session via
    // metadata.sessionId, so no cooldown is needed here.
    cooldownMinutes: null,
    subject: (d) => `Reminder: Your session "${d.workoutName}" is tomorrow`,
  },
  [NOTIFICATION_TYPES.SESSION_COMPLETED]: {
    category: "sessions",
    transactional: false,
    template: tpl(SessionCompletedEmail),
    cooldownMinutes: null,
    subject: (d) => `${d.clientName} completed a session`,
  },
  [NOTIFICATION_TYPES.MISSED_SESSION]: {
    category: "sessions",
    transactional: false,
    template: tpl(MissedSessionEmail),
    cooldownMinutes: 1440,
    subject: (d) => `Missed sessions: ${d.clientName}`,
  },
  [NOTIFICATION_TYPES.EXERCISE_NOTE]: {
    category: "sessions",
    transactional: false,
    template: tpl(ExerciseNoteEmail),
    cooldownMinutes: 60,
    subject: (d) => `${d.clientName} left a note on an exercise`,
  },

  // ── Messages & check-ins ──────────────────────────────────────────────────
  [NOTIFICATION_TYPES.NEW_MESSAGE]: {
    category: "messages",
    transactional: false,
    template: tpl(NewMessageEmail),
    cooldownMinutes: 60,
    subject: (d) => `New message from ${d.senderName}`,
  },
  [NOTIFICATION_TYPES.CHECK_IN_DUE]: {
    category: "messages",
    transactional: false,
    template: tpl(CheckInAssignedEmail),
    cooldownMinutes: null,
    subject: (d) => `New check-in: ${d.templateName}`,
  },
  [NOTIFICATION_TYPES.NEW_RESPONSE]: {
    category: "messages",
    transactional: false,
    template: tpl(CheckInResponseEmail),
    cooldownMinutes: 60,
    subject: (d) => `${d.clientName} submitted a check-in`,
  },
  [NOTIFICATION_TYPES.VOICE_MEMO]: {
    category: "messages",
    transactional: false,
    template: tpl(VoiceMemoAddedEmail),
    cooldownMinutes: 60,
    // This branch used to live inside voice-memo-added.tsx.
    subject: (d) =>
      d.role === "client"
        ? `${d.senderName} left you a voice note`
        : `${d.senderName} left a voice note`,
  },
  [NOTIFICATION_TYPES.FEEDBACK_RESPONSE]: {
    category: "messages",
    transactional: false,
    template: tpl(FeedbackResponseEmail),
    cooldownMinutes: null,
    subject: (d) => `${d.trainerName} replied to your feedback`,
  },

  // ── Nutrition ─────────────────────────────────────────────────────────────
  [NOTIFICATION_TYPES.NUTRITION_COMMENT]: {
    category: "nutrition",
    transactional: false,
    template: tpl(NutritionCommentEmail),
    cooldownMinutes: 60,
    subject: (d) => `${d.authorName} commented on your nutrition log`,
  },
  [NOTIFICATION_TYPES.NUTRITION_REPLY]: {
    category: "nutrition",
    transactional: false,
    template: tpl(NutritionCommentEmail),
    cooldownMinutes: 60,
    subject: (d) => `${d.authorName} replied to your nutrition comment`,
  },
  [NOTIFICATION_TYPES.NUTRITION_NUDGE_MEALS]: {
    category: "nutrition",
    transactional: false,
    template: tpl(NutritionNudgeEmail),
    cooldownMinutes: 1440,
    subject: () => "You have not logged your meals today",
  },
  [NOTIFICATION_TYPES.NUTRITION_NUDGE_PROTEIN]: {
    category: "nutrition",
    transactional: false,
    template: tpl(NutritionNudgeEmail),
    cooldownMinutes: 1440,
    subject: () => "You are behind on your protein target",
  },
  [NOTIFICATION_TYPES.NUTRITION_NUDGE_WATER]: {
    category: "nutrition",
    transactional: false,
    template: tpl(NutritionNudgeEmail),
    cooldownMinutes: 1440,
    subject: () => "You are behind on your water target",
  },

  // ── Billing (transactional — ignores preferences, no unsubscribe link) ────
  [NOTIFICATION_TYPES.PAYMENT_FAILED]: {
    category: "billing",
    transactional: true,
    template: tpl(PaymentFailedEmail),
    cooldownMinutes: null,
    subject: () => "Action required: your payment failed",
  },
  [NOTIFICATION_TYPES.SUBSCRIPTION_CANCELED]: {
    category: "billing",
    transactional: true,
    template: tpl(SubscriptionCanceledEmail),
    cooldownMinutes: null,
    subject: () => "Your subscription has been canceled",
  },
  [NOTIFICATION_TYPES.REFUND_PROCESSED]: {
    category: "billing",
    transactional: true,
    template: tpl(RefundProcessedEmail),
    cooldownMinutes: null,
    subject: () => "Your refund has been processed",
  },
};
