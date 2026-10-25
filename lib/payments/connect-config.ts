/**
 * Trainer payments (Stripe Connect) — constants shared by the services, the
 * Connect webhook and the UI. Kept free of server-only imports so client
 * components can read the labels and status unions.
 *
 * MIA's own billing (trainer plans, club memberships, the self-serve funnel)
 * never uses anything in this file: Connect money lives on the trainer's own
 * Stripe account and is tagged `CONNECT_PURCHASE_TYPE` everywhere.
 */

/**
 * MIA takes no commission on trainer sales (spec §3). Checkout Sessions are
 * direct charges on the connected account with no `application_fee_amount`;
 * this constant exists so the decision is documented in one place and any
 * future fee is a deliberate, reviewable change.
 */
export const PLATFORM_FEE_BPS = 0;

/**
 * Stripe request options for live reads made while rendering a page (/payments,
 * club price labels on member pages). These only display data
 * and every caller fails soft, so give up fast instead of the client default
 * (80s per attempt + 2 retries ≈ 4 minutes of spinner when Stripe is slow or
 * unreachable). Never use for writes or webhook handling.
 */
export const LIVE_READ_REQUEST_OPTIONS = { timeout: 8_000, maxNetworkRetries: 0 } as const;

/** Metadata tag on every Connect Checkout Session, PaymentIntent and Subscription. */
export const CONNECT_PURCHASE_TYPE = "connect_offer";

/** v1 sells in USD only; the price is stored and charged in this currency. */
export const OFFER_CURRENCY = "usd";

/** $1.00 – $10,000.00. Stripe's floor is $0.50; anything lower is almost certainly a typo. */
export const OFFER_MIN_PRICE_CENTS = 100;
export const OFFER_MAX_PRICE_CENTS = 1_000_000;

export const OFFER_KINDS = ["PROGRAM", "COACHING"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const CANCELLATION_POLICIES = ["END_OF_PERIOD", "IMMEDIATE"] as const;
export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];

export type OfferPurchaseStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type FulfillmentStatus = "PENDING" | "FULFILLED" | "FAILED";
/**
 * PAUSED: Stripe stopped collecting (`unpaid`, or `paused`) — access is
 * paused until the subscription returns to active.
 */
export type OfferSubscriptionStatus = "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "CANCELED";

/** Subscription states that still bill (or will) — a second checkout for the same offer is blocked. */
export const LIVE_SUBSCRIPTION_STATUSES: OfferSubscriptionStatus[] = ["INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED"];

/** Shown to clients and trainers (everything except never-completed checkouts). */
export const VISIBLE_SUBSCRIPTION_STATUSES: OfferSubscriptionStatus[] = ["ACTIVE", "PAST_DUE", "PAUSED", "CANCELED"];

export const CANCELLATION_POLICY_LABELS: Record<CancellationPolicy, string> = {
  END_OF_PERIOD: "Access until the end of the paid month",
  IMMEDIATE: "Access ends immediately",
};

/** The "connect an existing Stripe account" (Standard OAuth) button is shown only when this is configured. */
export function isConnectOAuthEnabled(): boolean {
  return Boolean(process.env.STRIPE_CONNECT_CLIENT_ID);
}
