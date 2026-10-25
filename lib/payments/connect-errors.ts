/**
 * Domain errors for trainer payments. The message is always safe to show in
 * the UI; actions map it straight to `{ success: false, error }`. Anything
 * that is not a PaymentsError (Stripe outage, DB error) is logged and shown
 * as a generic message instead.
 */
export type PaymentsErrorCode =
  | "unavailable"
  | "forbidden"
  | "not_found"
  | "not_connected"
  | "charges_disabled"
  | "invalid_input"
  | "invalid_state"
  | "already_subscribed"
  | "already_purchased"
  | "oauth_disabled"
  | "account_in_use";

const DEFAULT_MESSAGES: Record<PaymentsErrorCode, string> = {
  unavailable: "Payments aren't available for your account.",
  forbidden: "You can't do that.",
  not_found: "Not found.",
  not_connected: "Connect a Stripe account first.",
  charges_disabled: "Finish Stripe onboarding before you can take payments.",
  invalid_input: "Some of the details are invalid.",
  invalid_state: "This has changed. Refresh and try again.",
  already_subscribed: "You already have this membership.",
  already_purchased: "You already own this program.",
  oauth_disabled: "Connecting an existing Stripe account isn't enabled.",
  account_in_use: "That Stripe account is already connected to another MIA trainer.",
};

export class PaymentsError extends Error {
  constructor(public code: PaymentsErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "PaymentsError";
  }
}

export const GENERIC_PAYMENTS_ERROR = "Something went wrong with Stripe. Please try again.";

/** Turns any thrown value into a UI-safe message, logging the unexpected ones. */
export function paymentsErrorMessage(err: unknown, context: string): string {
  if (err instanceof PaymentsError) return err.message;
  console.error(`[payments] ${context} failed:`, err);
  return GENERIC_PAYMENTS_ERROR;
}
