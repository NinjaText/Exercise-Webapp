import type { CoachingStatus } from "@prisma/client";

/**
 * The coaching add-on state machine (spec §6). Pure: the service and the
 * Stripe sync both ask it whether a move is legal before their conditional
 * write, so replayed or out-of-order events are rejected rather than applied.
 */
export type CoachingEvent =
  | "member_request"
  | "trainer_accept"
  | "trainer_decline"
  | "member_withdraw"
  | "trainer_withdraw"
  | "payment_succeeded"
  | "payment_failed"
  | "subscription_ended"
  | "membership_ended";

/** `NONE` stands for "no MemberCoaching row yet". */
type From = CoachingStatus | "NONE";

const TRANSITIONS: Record<CoachingEvent, Partial<Record<From, CoachingStatus>>> = {
  member_request: { NONE: "REQUESTED", DECLINED: "REQUESTED", CANCELED: "REQUESTED" },
  trainer_accept: { REQUESTED: "ACCEPTED" },
  trainer_decline: { REQUESTED: "DECLINED" },
  member_withdraw: { REQUESTED: "CANCELED", ACCEPTED: "CANCELED" },
  trainer_withdraw: { REQUESTED: "CANCELED", ACCEPTED: "CANCELED" },
  payment_succeeded: { ACCEPTED: "ACTIVE", PAST_DUE: "ACTIVE" },
  payment_failed: { ACTIVE: "PAST_DUE" },
  subscription_ended: { ACTIVE: "CANCELED", PAST_DUE: "CANCELED" },
  membership_ended: {
    REQUESTED: "CANCELED",
    ACCEPTED: "CANCELED",
    ACTIVE: "CANCELED",
    PAST_DUE: "CANCELED",
  },
};

/** The status after `event`, or `null` when the move is not allowed. */
export function nextCoachingStatus(
  current: CoachingStatus | null,
  event: CoachingEvent
): CoachingStatus | null {
  return TRANSITIONS[event][current ?? "NONE"] ?? null;
}

export type CoachingPanelAction = "accept" | "decline" | "withdraw" | "end";

/**
 * The trainer actions offered for a coaching row, drawn from the legal
 * state-machine moves; ending an active
 * subscription isn't a status move (it cancels at period end) so it is
 * offered for ACTIVE/PAST_DUE until the cancel is already scheduled.
 */
export function coachingPanelActions(
  status: CoachingStatus | null,
  cancelAtPeriodEnd = false
): CoachingPanelAction[] {
  const actions: CoachingPanelAction[] = [];
  if (nextCoachingStatus(status, "trainer_accept")) actions.push("accept");
  if (nextCoachingStatus(status, "trainer_decline")) actions.push("decline");
  // "Withdraw offer" applies once accepted; a pending request is declined instead.
  if (status === "ACCEPTED" && nextCoachingStatus(status, "trainer_withdraw")) actions.push("withdraw");
  if ((status === "ACTIVE" || status === "PAST_DUE") && !cancelAtPeriodEnd) actions.push("end");
  return actions;
}

/**
 * The member's /billing link to the dashboard coaching card: start an
 * accepted offer, or (re-)request when there is none, or the last one was
 * declined or ended (both allow `member_request`). `null` while a request is
 * pending or coaching is paid.
 */
export function memberCoachingLinkLabel(status: CoachingStatus | null): string | null {
  if (status === "ACCEPTED") return "Start coaching on your dashboard";
  if (nextCoachingStatus(status, "member_request")) return "Request coaching on your dashboard";
  return null;
}
