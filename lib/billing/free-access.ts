import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { isStripeSubscriptionAlreadyCanceled } from "@/lib/billing/stripe-errors";

/**
 * Admin-granted complimentary access (User.billingExemptAt). Once set, every
 * billing gate treats the account as exempt (see isBillingExempt).
 *
 * Granting also stops Stripe from ever charging them: any live MIA
 * subscription (trainer plan or club membership, both on the platform
 * account) is set to cancel at the end of its current period. During a
 * 7-day trial that means it simply ends when the trial ends, with no
 * invoice; on a paid period it runs out without renewing, so nothing needs
 * refunding. Stripe goes first so a Stripe failure changes nothing.
 *
 * Separately purchased coaching or programs are not touched.
 */
export async function grantFreeAccess(userId: string, note: string | null) {
  const [trainerSub, memberSub] = await Promise.all([
    prisma.trainerSubscription.findUnique({
      where: { trainerId: userId },
      select: { id: true, status: true, stripeSubscriptionId: true },
    }),
    prisma.memberSubscription.findUnique({
      where: { userId },
      select: { id: true, status: true, stripeSubscriptionId: true },
    }),
  ]);

  let stoppedSubscriptions = 0;
  for (const sub of [trainerSub, memberSub]) {
    if (!sub?.stripeSubscriptionId || sub.status === "CANCELED") continue;
    try {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
      stoppedSubscriptions++;
    } catch (error) {
      if (!isStripeSubscriptionAlreadyCanceled(error, sub.stripeSubscriptionId, "[free-access]")) throw error;
    }
  }
  if (trainerSub?.stripeSubscriptionId && trainerSub.status !== "CANCELED") {
    await prisma.trainerSubscription.update({ where: { id: trainerSub.id }, data: { cancelAtPeriodEnd: true } });
  }
  if (memberSub?.stripeSubscriptionId && memberSub.status !== "CANCELED") {
    await prisma.memberSubscription.update({ where: { id: memberSub.id }, data: { cancelAtPeriodEnd: true } });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { billingExemptAt: new Date(), billingExemptNote: note?.trim() || null },
  });
  return { stoppedSubscriptions };
}

/**
 * Removes admin-granted free access. Stripe is left alone: a subscription
 * already set to end still ends, and from then on the account goes through
 * the normal billing gate (subscribe; the one free trial is not repeated).
 */
export async function revokeFreeAccess(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { billingExemptAt: null, billingExemptNote: null },
  });
}
