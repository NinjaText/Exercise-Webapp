import type Stripe from "stripe";
import type { Referral } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { COACHING_PURCHASE_TYPE } from "@/lib/services/coaching.service";
import { formatBasisPoints, formatCents, signupCommissionCents } from "./terms";

export interface PaidInvoiceFacts {
  invoiceId: string;
  amountPaidCents: number;
  currency: string;
  paidAt: Date;
}

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === "P2002";

function invoiceSubscription(invoice: Stripe.Invoice): { id: string | null; metadata: Stripe.Metadata | null } {
  const details = invoice.parent?.subscription_details;
  const sub = details?.subscription;
  return { id: typeof sub === "string" ? sub : (sub?.id ?? null), metadata: details?.metadata ?? null };
}

export function paidInvoiceFacts(invoice: Stripe.Invoice): PaidInvoiceFacts | null {
  if (!invoice.id || (invoice.amount_paid ?? 0) <= 0) return null;
  const paidAtSec = invoice.status_transitions?.paid_at ?? invoice.created;
  return {
    invoiceId: invoice.id,
    amountPaidCents: invoice.amount_paid,
    currency: invoice.currency ?? "usd",
    paidAt: new Date(paidAtSec * 1000),
  };
}

/**
 * The MIA account an invoice bills for: a trainer plan or a club membership.
 * Coaching invoices share the member's Stripe customer and are excluded —
 * contractors earn on MIA subscriptions only.
 */
export async function referredUserIdForInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
  const sub = invoiceSubscription(invoice);
  if (!customerId || !sub.id) return null;
  if (sub.metadata?.purchaseType === COACHING_PURCHASE_TYPE) return null;

  const trainer = await prisma.trainerSubscription.findUnique({
    where: { stripeCustomerId: customerId },
    select: { trainerId: true },
  });
  if (trainer) return trainer.trainerId;

  const member = await prisma.memberSubscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });
  return member?.userId ?? null;
}

/** Creates the referral's one signup commission (idempotent). */
export async function ensureSignupCommission(
  referral: Pick<
    Referral,
    "id" | "contractorId" | "referredName" | "subscriberType" | "commissionType" | "commissionValue" | "firstPaidAmountCents" | "currency" | "firstPaidAt"
  >
): Promise<string | null> {
  const paid = referral.firstPaidAmountCents ?? 0;
  const amountCents = signupCommissionCents(referral, paid);
  if (amountCents <= 0) return null;
  const who = referral.subscriberType === "TRAINER" ? "trainer" : "individual";
  const basis =
    referral.commissionType === "PERCENT"
      ? `${formatBasisPoints(referral.commissionValue)} of ${formatCents(paid)}`
      : "fixed";
  try {
    const row = await prisma.commission.create({
      data: {
        contractorId: referral.contractorId,
        kind: "SIGNUP",
        status: "UNPAID",
        amountCents,
        currency: referral.currency ?? "usd",
        description: `Signup — ${referral.referredName} (${who}, ${basis})`,
        sourceKey: `signup:${referral.id}`,
        referralIds: [referral.id],
        earnedAt: referral.firstPaidAt ?? new Date(),
        payoutId: null,
        paidAt: null,
        voidedAt: null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/**
 * Applies one paid invoice to a referral. Safe to call repeatedly with the
 * same invoice (webhook retries, the sweep's backfill): every write is a
 * compare-and-set keyed on the invoice id or on "not yet paid".
 */
export async function applyPaidInvoice(referralId: string, facts: PaidInvoiceFacts): Promise<void> {
  await prisma.referral.updateMany({
    where: { id: referralId, NOT: { paidInvoiceIds: { has: facts.invoiceId } } },
    data: {
      paidInvoiceIds: { push: facts.invoiceId },
      paidInvoiceCount: { increment: 1 },
      totalPaidCents: { increment: facts.amountPaidCents },
      lastPaidAt: facts.paidAt,
    },
  });

  const first = await prisma.referral.updateMany({
    where: { id: referralId, ...nullOrUnset("firstPaidAt") },
    data: {
      status: "CONVERTED",
      firstPaidAt: facts.paidAt,
      firstPaidInvoiceId: facts.invoiceId,
      firstPaidAmountCents: facts.amountPaidCents,
      currency: facts.currency,
      retentionStartAt: facts.paidAt,
      churnedAt: null,
    },
  });

  if (first.count === 0) {
    // Came back after churning: retention has to be earned again from now.
    await prisma.referral.updateMany({
      where: { id: referralId, status: "CHURNED" },
      data: { status: "CONVERTED", retentionStartAt: facts.paidAt, churnedAt: null },
    });
  }

  const referral = await prisma.referral.findUnique({ where: { id: referralId } });
  // Re-checked rather than trusting `first.count`, so a crash between the
  // conversion and the commission is repaired by the retry.
  if (referral && referral.firstPaidInvoiceId === facts.invoiceId) {
    await ensureSignupCommission(referral);
  }
}

/** `invoice.paid` on the platform account. Returns true when it touched a referral. */
export async function recordReferralInvoicePayment(invoice: Stripe.Invoice): Promise<boolean> {
  const facts = paidInvoiceFacts(invoice);
  if (!facts) return false;
  const userId = await referredUserIdForInvoice(invoice);
  if (!userId) return false;
  const referral = await prisma.referral.findUnique({ where: { referredUserId: userId }, select: { id: true } });
  if (!referral) return false;
  await applyPaidInvoice(referral.id, facts);
  return true;
}
