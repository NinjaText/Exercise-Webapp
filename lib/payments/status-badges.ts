import type { StatusRole } from "@/lib/ui/status";

/**
 * Badge label + role for every trainer-payments status. Kept apart from
 * lib/ui/status.ts's ROLE_BY_STATUS because ACTIVE / PAST_DUE / PENDING
 * already mean other things there. Client-safe (no server imports).
 */
export interface PaymentBadge {
  label: string;
  role: StatusRole;
}

const FALLBACK: PaymentBadge = { label: "Unknown", role: "neutral" };

export const CONNECT_STATUS_BADGE: Record<string, PaymentBadge> = {
  NOT_CONNECTED: { label: "Not connected", role: "neutral" },
  ONBOARDING: { label: "Setup incomplete", role: "warning" },
  RESTRICTED: { label: "Action needed", role: "warning" },
  ACTIVE: { label: "Accepting payments", role: "success" },
  DISCONNECTED: { label: "Disconnected", role: "danger" },
};

export const SUBSCRIPTION_BADGE: Record<string, PaymentBadge> = {
  INCOMPLETE: { label: "Incomplete", role: "neutral" },
  ACTIVE: { label: "Active", role: "success" },
  ENDING: { label: "Ending", role: "warning" },
  PAST_DUE: { label: "Payment failed", role: "danger" },
  PAUSED: { label: "Paused", role: "warning" },
  CANCELED: { label: "Canceled", role: "neutral" },
};

export const PURCHASE_BADGE: Record<string, PaymentBadge> = {
  PENDING: { label: "Processing", role: "info" },
  PAID: { label: "Paid", role: "success" },
  FAILED: { label: "Failed", role: "danger" },
  REFUNDED: { label: "Refunded", role: "neutral" },
};

export const CHARGE_BADGE: Record<string, PaymentBadge> = {
  SUCCEEDED: { label: "Succeeded", role: "success" },
  PENDING: { label: "Pending", role: "info" },
  FAILED: { label: "Failed", role: "danger" },
  REFUNDED: { label: "Refunded", role: "neutral" },
  PARTIALLY_REFUNDED: { label: "Partially refunded", role: "warning" },
};

export const PAYOUT_BADGE: Record<string, PaymentBadge> = {
  paid: { label: "Paid", role: "success" },
  pending: { label: "Pending", role: "info" },
  in_transit: { label: "In transit", role: "info" },
  canceled: { label: "Canceled", role: "neutral" },
  failed: { label: "Failed", role: "danger" },
};

export function badgeFor(map: Record<string, PaymentBadge>, status: string): PaymentBadge {
  return map[status] ?? { ...FALLBACK, label: status };
}

/** A live membership scheduled to end shows as "Ending" rather than "Active". */
export function subscriptionBadge(status: string, cancelAtPeriodEnd: boolean): PaymentBadge {
  if (status === "ACTIVE" && cancelAtPeriodEnd) return SUBSCRIPTION_BADGE.ENDING;
  return badgeFor(SUBSCRIPTION_BADGE, status);
}
