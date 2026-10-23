import type Stripe from "stripe";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { appBaseUrl } from "@/lib/utils/app-url";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import { getTrainersForClient } from "@/lib/services/client.service";
import { getChargeableAccount } from "@/lib/services/connected-account.service";
import { assertPaymentsAvailable } from "@/lib/payments/payments-access";
import { PaymentsError } from "@/lib/payments/connect-errors";
import { CONNECT_PURCHASE_TYPE, LIVE_SUBSCRIPTION_STATUSES } from "@/lib/payments/connect-config";

/**
 * Client checkout for a trainer's offer (spec §3 "Checkout"). A direct
 * charge on the trainer's connected account: the Checkout Session is
 * created with `{ stripeAccount }` and carries no `application_fee_amount`
 * (PLATFORM_FEE_BPS = 0 — MIA takes no commission). The money, the
 * customer and the receipt all belong to the trainer's Stripe account.
 */

type Client = Pick<User, "id" | "role" | "clerkOrgId" | "email" | "firstName" | "lastName">;

/** Stripe subscription states that mean "already a member" (incomplete ones are unpaid attempts). */
const MEMBER_STRIPE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/**
 * A second checkout for the same program (another tab, a double click)
 * must not lead to a second charge: earlier PENDING sessions are expired
 * first. A session that already completed means a payment is in flight, so
 * the new checkout is refused until the webhook lands.
 */
async function supersedePendingPurchases(clientId: string, offerId: string): Promise<void> {
  const pending = await prisma.offerPurchase.findMany({
    where: { clientId, offerId, status: "PENDING" },
    select: { id: true, stripeCheckoutSessionId: true, stripeAccountId: true },
  });
  for (const purchase of pending) {
    const stripeAccount = purchase.stripeAccountId;
    const session = await stripe.checkout.sessions.retrieve(purchase.stripeCheckoutSessionId, {}, { stripeAccount });
    if (session.status === "complete") {
      throw new PaymentsError("invalid_state", "Your earlier payment for this program is still being processed.");
    }
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount });
    await prisma.offerPurchase.updateMany({
      where: { id: purchase.id, status: "PENDING" },
      data: { status: "FAILED", failureReason: session.status === "open" ? "Superseded by a newer checkout" : "Checkout expired" },
    });
  }
}

/**
 * The client's customer on the trainer's account, reused across checkouts
 * so open sessions and subscriptions can be found per client: the latest
 * membership's customer, else one tagged with this client, else a new one.
 */
async function getOrCreateCustomer(client: Client, stripeAccount: string): Promise<string> {
  const previous = await prisma.offerSubscription.findFirst({
    where: { clientId: client.id, stripeAccountId: stripeAccount },
    select: { stripeCustomerId: true },
    orderBy: { createdAt: "desc" },
  });
  if (previous?.stripeCustomerId) return previous.stripeCustomerId;

  const found = await stripe.customers.list({ email: client.email, limit: 10 }, { stripeAccount });
  const tagged = found.data.find((c) => c.metadata?.clientId === client.id);
  if (tagged) return tagged.id;

  const name = `${client.firstName} ${client.lastName}`.trim();
  const created = await stripe.customers.create(
    { email: client.email, ...(name ? { name } : {}), metadata: { purchaseType: CONNECT_PURCHASE_TYPE, clientId: client.id } },
    { stripeAccount }
  );
  return created.id;
}

/**
 * Membership checkouts have no DB row until Stripe reports back, so Stripe
 * itself is the record: refuse when the customer already has a membership
 * to this offer (even one whose webhook hasn't arrived), and expire any
 * other open checkout for it so two tabs can't both subscribe.
 */
async function guardMembershipCheckout(customer: string, offerId: string, stripeAccount: string): Promise<void> {
  const ours = (m: Stripe.Metadata | null | undefined) => m?.purchaseType === CONNECT_PURCHASE_TYPE && m.offerId === offerId;

  const subs = await stripe.subscriptions.list({ customer, limit: 20 }, { stripeAccount });
  if (subs.data.some((sub) => ours(sub.metadata) && MEMBER_STRIPE_STATUSES.has(sub.status))) {
    throw new PaymentsError("already_subscribed");
  }
  const open = await stripe.checkout.sessions.list({ customer, status: "open", limit: 20 }, { stripeAccount });
  for (const session of open.data) {
    if (ours(session.metadata)) await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount });
  }
}

/**
 * Creates the Checkout Session and returns its URL. Refuses unless the offer
 * is active, sold by one of the client's own trainers, and that trainer can
 * take payments right now. PROGRAM: writes the PENDING OfferPurchase (keyed
 * by session id) before the redirect. COACHING: refuses a second live
 * membership to the same offer.
 */
export async function createOfferCheckout(client: Client, offerId: string): Promise<string> {
  if (client.role !== "CLIENT") throw new PaymentsError("forbidden", "Only clients can buy from the store.");
  await assertPaymentsAvailable(client);

  const offer = await prisma.paidOffer.findUnique({ where: { id: offerId } });
  if (!offer || !offer.isActive) throw new PaymentsError("not_found", "This offer is no longer available.");

  const trainers = await getTrainersForClient(client.id);
  if (!trainers.some((t) => t.id === offer.trainerId)) throw new PaymentsError("forbidden", "This offer isn't from your coach.");

  const account = await getChargeableAccount(offer.trainerId);
  if (!account || account.stripeAccountId !== offer.stripeAccountId) {
    throw new PaymentsError("charges_disabled", "Your coach can't take payments right now.");
  }

  if (offer.kind === "PROGRAM") {
    const owned = await prisma.offerPurchase.findFirst({
      where: { offerId: offer.id, clientId: client.id, status: "PAID" },
      select: { id: true },
    });
    if (owned) throw new PaymentsError("already_purchased");
    await supersedePendingPurchases(client.id, offer.id);
  } else {
    const live = await prisma.offerSubscription.findFirst({
      where: { offerId: offer.id, clientId: client.id, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
      select: { id: true },
    });
    if (live) throw new PaymentsError("already_subscribed");
  }

  const metadata = {
    purchaseType: CONNECT_PURCHASE_TYPE,
    offerId: offer.id,
    clientId: client.id,
    trainerId: offer.trainerId,
  };

  // Memberships always use one customer per client on the trainer's account
  // (needed to find open checkouts); a program reuses it when one exists.
  let customer: Pick<Stripe.Checkout.SessionCreateParams, "customer" | "customer_email">;
  if (offer.kind === "COACHING") {
    const customerId = await getOrCreateCustomer(client, offer.stripeAccountId);
    await guardMembershipCheckout(customerId, offer.id, offer.stripeAccountId);
    customer = { customer: customerId };
  } else {
    const previous = await prisma.offerSubscription.findFirst({
      where: { clientId: client.id, stripeAccountId: offer.stripeAccountId },
      select: { stripeCustomerId: true },
      orderBy: { createdAt: "desc" },
    });
    customer = previous?.stripeCustomerId ? { customer: previous.stripeCustomerId } : { customer_email: client.email };
  }

  const base = appBaseUrl();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: offer.kind === "PROGRAM" ? "payment" : "subscription",
    line_items: [{ price: offer.stripePriceId, quantity: 1 }],
    ...customer,
    client_reference_id: client.id,
    metadata,
    success_url: `${base}/store/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/store/canceled`,
    ...(offer.kind === "PROGRAM"
      ? { payment_intent_data: { metadata, description: offer.name } }
      : { subscription_data: { metadata, description: offer.name } }),
  };

  const session = await stripe.checkout.sessions.create(params, { stripeAccount: offer.stripeAccountId });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  if (offer.kind === "PROGRAM") {
    await prisma.offerPurchase.create({
      data: {
        offerId: offer.id,
        trainerId: offer.trainerId,
        clientId: client.id,
        stripeAccountId: offer.stripeAccountId,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: null,
        amountInCents: session.amount_total ?? offer.priceInCents,
        currency: session.currency ?? offer.currency,
        status: "PENDING",
        fulfillmentStatus: "PENDING",
        assignedProgramId: null,
        failureReason: null,
        paidAt: null,
        refundedAt: null,
      },
    });
  }

  await logUserAudit(client, () => ({
    action: AUDIT_ACTIONS.OFFER_CHECKOUT_STARTED,
    targetType: "PaidOffer",
    targetId: offer.id,
    targetLabel: offer.name,
    metadata: { kind: offer.kind, priceInCents: offer.priceInCents },
  }));
  return session.url;
}
