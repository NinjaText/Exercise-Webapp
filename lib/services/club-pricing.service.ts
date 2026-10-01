import { randomUUID } from "crypto";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { ClubError } from "@/lib/services/club-error";
import { formatStripeAmount } from "@/lib/utils/money";

/**
 * Stripe products/prices for a club, created from the dollar amounts the
 * super admin types into the club form. Prices are immutable in Stripe, so a
 * new amount is a new price on the same product; the old one is archived by
 * the caller only after its DB write succeeded. Nothing is ever deleted.
 */

export type ClubPriceKind = "membership" | "coaching";

const KIND_LABEL: Record<ClubPriceKind, string> = { membership: "Membership", coaching: "Coaching" };

export function clubProductName(clubName: string, kind: ClubPriceKind): string {
  return `${clubName} — ${KIND_LABEL[kind]}`;
}

export interface EnsureClubPriceArgs {
  clerkOrgId: string;
  clubName: string;
  kind: ClubPriceKind;
  amountCents: number;
  /** The club's stored price id (ours or a manually pasted one); null on create. */
  currentPriceId: string | null;
}

export interface EnsuredClubPrice {
  priceId: string;
  /** False = the current price already matched; nothing was created. */
  created: boolean;
  /** The price this one replaces (archive it after the DB write); null if none. */
  previousPriceId: string | null;
  productId: string;
  productCreated: boolean;
}

const UNAVAILABLE_MESSAGE = "Stripe couldn't be reached, so nothing was saved. Please try again.";

function isMissing(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "resource_missing";
}

function productIdOf(price: Stripe.Price): string {
  return typeof price.product === "string" ? price.product : price.product.id;
}

/** The current price's product when it can take a new price; null = create one. */
function reusableProductId(price: Stripe.Price): string | null {
  const product = price.product;
  if (typeof product === "string") return product;
  if ("deleted" in product && product.deleted) return null;
  return (product as Stripe.Product).active ? product.id : null;
}

function matches(price: Stripe.Price, amountCents: number): boolean {
  return (
    price.active &&
    reusableProductId(price) !== null &&
    price.unit_amount === amountCents &&
    price.currency === "usd" &&
    price.recurring?.interval === "month" &&
    (price.recurring.interval_count ?? 1) === 1
  );
}

async function retrieveCurrent(priceId: string): Promise<Stripe.Price | null> {
  try {
    return await stripe.prices.retrieve(priceId, { expand: ["product"] });
  } catch (err) {
    if (isMissing(err)) return null;
    console.error("[club-pricing] couldn't read price", priceId, err);
    throw new ClubError("stripe_unavailable", UNAVAILABLE_MESSAGE);
  }
}

/**
 * Creates the price. Each attempt uses a fresh server-side idempotency key, so
 * stripe-node's own network retries of that call dedupe, while a new submit
 * (e.g. after a rolled-back one archived its price) never gets a cached,
 * now-archived price back. A replayed or inactive response is re-read and, if
 * archived, created once more under a new key.
 */
async function createPrice(params: Stripe.PriceCreateParams, keyBase: string): Promise<Stripe.Price> {
  for (let attempt = 0; ; attempt++) {
    const price = await stripe.prices.create(params, { idempotencyKey: `${keyBase}:price:${randomUUID()}` });
    const replayed = price.lastResponse?.headers?.["idempotent-replayed"] === "true";
    if (!replayed && price.active) return price;
    const fresh = await stripe.prices.retrieve(price.id);
    if (fresh.active) return price;
    if (attempt >= 1) throw new Error(`Stripe returned an archived price twice (${price.id})`);
  }
}

export async function ensureClubPrice(args: EnsureClubPriceArgs): Promise<EnsuredClubPrice> {
  const { clerkOrgId, clubName, kind, amountCents, currentPriceId } = args;
  const current = currentPriceId ? await retrieveCurrent(currentPriceId) : null;
  if (current && matches(current, amountCents)) {
    return { priceId: current.id, created: false, previousPriceId: null, productId: productIdOf(current), productCreated: false };
  }

  const keyBase = `club:${clerkOrgId}:${kind}`;
  let productId = current ? reusableProductId(current) : null;
  let productCreated = false;
  try {
    if (!productId) {
      const product = await stripe.products.create(
        { name: clubProductName(clubName, kind), metadata: { clerkOrgId, kind, app: "club" } },
        { idempotencyKey: `${keyBase}:product:${randomUUID()}` }
      );
      productId = product.id;
      productCreated = true;
    }
    const price = await createPrice(
      {
        unit_amount: amountCents,
        currency: "usd",
        recurring: { interval: "month" },
        product: productId,
        metadata: { clerkOrgId, kind },
      },
      keyBase
    );
    return { priceId: price.id, created: true, previousPriceId: current?.id ?? null, productId, productCreated };
  } catch (err) {
    console.error("[club-pricing] couldn't create price", clerkOrgId, kind, err);
    if (productCreated && productId) await disableClubProduct(productId);
    throw new ClubError("stripe_unavailable", UNAVAILABLE_MESSAGE);
  }
}

/** Archives a price (never deletes). Best-effort: logs, never throws. */
export async function disableClubPrice(priceId: string): Promise<void> {
  try {
    await stripe.prices.update(priceId, { active: false });
  } catch (err) {
    console.error("[club-pricing] couldn't archive price", priceId, err);
  }
}

async function disableClubProduct(productId: string): Promise<void> {
  try {
    await stripe.products.update(productId, { active: false });
  } catch (err) {
    console.error("[club-pricing] couldn't archive product", productId, err);
  }
}

/** Undo for a failed create/update: archives what this request created. */
export async function rollbackClubPrices(results: EnsuredClubPrice[]): Promise<void> {
  for (const r of results) {
    if (!r.created) continue;
    await disableClubPrice(r.priceId);
    if (r.productCreated) await disableClubProduct(r.productId);
  }
}

/**
 * After a club rename. Only products this app created (metadata.app "club")
 * are renamed; a manually pasted price's product is left alone. Best-effort.
 */
export async function renameClubProducts(priceIds: string[], clubName: string): Promise<void> {
  for (const priceId of priceIds) {
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
      const product = price.product;
      if (typeof product === "string" || ("deleted" in product && product.deleted)) continue;
      const { app, kind } = (product as Stripe.Product).metadata ?? {};
      if (app !== "club" || (kind !== "membership" && kind !== "coaching")) continue;
      await stripe.products.update(product.id, { name: clubProductName(clubName, kind) });
    } catch (err) {
      console.error("[club-pricing] couldn't rename product for price", priceId, err);
    }
  }
}

export type ClubPriceView =
  | { status: "none" }
  /** Stripe couldn't be read; the stored price is unknown, not absent. */
  | { status: "unavailable" }
  /** Loaded, but not a flat per-unit amount (tiered / custom). */
  | { status: "unsupported" }
  | { status: "ok"; amountCents: number; label: string; usdMonthly: boolean };

/** For admin pages: "$14.99/mo", and whether the form can edit it as a USD monthly amount. */
export async function describeClubPrice(priceId: string | null): Promise<ClubPriceView> {
  if (!priceId) return { status: "none" };
  try {
    // Short and unretried so admin pages degrade quickly during an outage.
    const price = await stripe.prices.retrieve(priceId, {}, { timeout: 5000, maxNetworkRetries: 0 });
    if (price.unit_amount == null) return { status: "unsupported" };
    const monthly = price.recurring?.interval === "month" && (price.recurring.interval_count ?? 1) === 1;
    const per = monthly ? "mo" : (price.recurring?.interval ?? "one-time");
    return {
      status: "ok",
      amountCents: price.unit_amount,
      label: `${formatStripeAmount(price.unit_amount, price.currency)}/${per}`,
      usdMonthly: monthly && price.currency === "usd",
    };
  } catch (err) {
    console.error("[club-pricing] couldn't read price", priceId, err);
    return { status: "unavailable" };
  }
}
