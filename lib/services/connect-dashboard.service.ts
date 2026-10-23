import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/**
 * Live, read-only views of a trainer's connected account for /payments
 * (spec §3 "Trainer /payments"). Small page sizes, and every call fails
 * soft: the page renders an inline error instead of crashing.
 */

export type LiveResult<T> = { ok: true; data: T } | { ok: false; error: string };

const LIVE_ERROR = "Couldn't load this from Stripe right now. Try again in a moment.";

export type ChargeDisplayStatus = "SUCCEEDED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "PENDING";

export interface ChargeRow {
  id: string;
  status: ChargeDisplayStatus;
  amount: number;
  amountRefunded: number;
  currency: string;
  created: Date;
  description: string | null;
  customerLabel: string;
  failureMessage: string | null;
}

export interface PayoutRow {
  id: string;
  amount: number;
  currency: string;
  arrivalDate: Date;
  status: string;
}

export interface PayoutsOverview {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  payouts: PayoutRow[];
}

export function chargeDisplayStatus(charge: Pick<Stripe.Charge, "status" | "refunded" | "amount_refunded">): ChargeDisplayStatus {
  if (charge.refunded) return "REFUNDED";
  if (charge.amount_refunded > 0) return "PARTIALLY_REFUNDED";
  if (charge.status === "failed") return "FAILED";
  if (charge.status === "pending") return "PENDING";
  return "SUCCEEDED";
}

function chargeCustomerId(charge: Stripe.Charge): string | null {
  if (!charge.customer) return null;
  return typeof charge.customer === "string" ? charge.customer : charge.customer.id;
}

/**
 * Maps charges to the trainer's MIA client names, by (in order) charge
 * metadata, the Stripe customer of a membership (renewal charges carry no
 * metadata, and the card on file may have no email), then billing email.
 * Keys: client id, `cus:<stripe customer id>`, lower-cased email.
 */
async function labelCustomers(
  stripeAccountId: string,
  trainerClerkOrgId: string | null,
  charges: Stripe.Charge[]
): Promise<Map<string, string>> {
  const emails = new Set<string>();
  const ids = new Set<string>();
  const customerIds = new Set<string>();
  for (const c of charges) {
    const email = (c.billing_details?.email ?? c.receipt_email ?? "").toLowerCase();
    if (email) emails.add(email);
    if (c.metadata?.clientId) ids.add(c.metadata.clientId);
    const customerId = chargeCustomerId(c);
    if (customerId) customerIds.add(customerId);
  }
  if (!trainerClerkOrgId || (emails.size === 0 && ids.size === 0 && customerIds.size === 0)) return new Map();

  const memberships = customerIds.size
    ? await prisma.offerSubscription.findMany({
        where: { stripeAccountId, stripeCustomerId: { in: [...customerIds] } },
        select: { stripeCustomerId: true, clientId: true },
      })
    : [];
  for (const m of memberships) ids.add(m.clientId);

  const users = await prisma.user.findMany({
    where: {
      clerkOrgId: trainerClerkOrgId,
      role: "CLIENT",
      OR: [{ email: { in: [...emails] } }, { id: { in: [...ids].filter((id) => /^[a-f0-9]{24}$/i.test(id)) } }],
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const labels = new Map<string, string>();
  for (const u of users) {
    const name = `${u.firstName} ${u.lastName}`.trim() || u.email;
    labels.set(u.email.toLowerCase(), name);
    labels.set(u.id, name);
  }
  for (const m of memberships) {
    const name = labels.get(m.clientId);
    if (name) labels.set(`cus:${m.stripeCustomerId}`, name);
  }
  return labels;
}

export async function listRecentCharges(
  stripeAccountId: string,
  trainerClerkOrgId: string | null,
  limit = 25
): Promise<LiveResult<ChargeRow[]>> {
  try {
    const charges = await stripe.charges.list({ limit }, { stripeAccount: stripeAccountId });
    const labels = await labelCustomers(stripeAccountId, trainerClerkOrgId, charges.data);
    return {
      ok: true,
      data: charges.data.map((c) => {
        const email = c.billing_details?.email ?? c.receipt_email ?? null;
        const customerId = chargeCustomerId(c);
        const label =
          (c.metadata?.clientId && labels.get(c.metadata.clientId)) ||
          (customerId && labels.get(`cus:${customerId}`)) ||
          (email && labels.get(email.toLowerCase())) ||
          c.billing_details?.name ||
          email ||
          "Unknown customer";
        return {
          id: c.id,
          status: chargeDisplayStatus(c),
          amount: c.amount,
          amountRefunded: c.amount_refunded,
          currency: c.currency,
          created: new Date(c.created * 1000),
          description: c.description,
          customerLabel: label,
          failureMessage: c.failure_message,
        };
      }),
    };
  } catch (err) {
    console.error(`[payments] charges.list failed for ${stripeAccountId}:`, err);
    return { ok: false, error: LIVE_ERROR };
  }
}

export async function getPayoutsOverview(stripeAccountId: string, limit = 10): Promise<LiveResult<PayoutsOverview>> {
  try {
    const opts = { stripeAccount: stripeAccountId };
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve({}, opts),
      stripe.payouts.list({ limit }, opts),
    ]);
    return {
      ok: true,
      data: {
        available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
        pending: balance.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
        payouts: payouts.data.map((p) => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          arrivalDate: new Date(p.arrival_date * 1000),
          status: p.status,
        })),
      },
    };
  } catch (err) {
    console.error(`[payments] balance/payouts read failed for ${stripeAccountId}:`, err);
    return { ok: false, error: LIVE_ERROR };
  }
}
