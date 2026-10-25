import { NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import {
  handleAccountDeauthorized,
  isKnownConnectAccount,
  syncConnectedAccountFromStripe,
} from "@/lib/services/connected-account.service";
import {
  fulfillOfferPurchase,
  handleChargeRefunded,
  handleDisputeClosed,
  markPurchasePaid,
  markPurchasePaymentFailed,
  parseConnectMetadata,
} from "@/lib/services/offer-purchase.service";
import {
  applySubscriptionAccess,
  handleOfferInvoicePaid,
  handleOfferInvoicePaymentFailed,
  syncOfferSubscription,
  type SyncResult,
} from "@/lib/services/offer-subscription.service";

/**
 * POST /api/stripe/connect/webhook — Stripe Connect events (spec §3).
 *
 * A separate endpoint and signing secret from MIA's own billing webhook
 * (/api/stripe/webhook): this one is registered in Stripe as a Connect
 * endpoint ("Events on Connected accounts"), so every event carries
 * `event.account`. Only accounts MIA knows (a trainer's current account, or
 * a previous one their offers were sold on) are handled, and only objects
 * tagged purchaseType "connect_offer" whose buyer is a client of that
 * trainer; everything else is acknowledged and ignored.
 *
 * Handlers are idempotent (conditional status writes, unique Stripe ids)
 * because Stripe redelivers. Slow work (program cloning) runs in `after()`
 * so Stripe gets a fast 2xx; its failures are recorded for the retry cron.
 * A thrown error returns 500 so Stripe retries the event.
 */

function runAccessInBackground(result: SyncResult | null): void {
  if (!result) return;
  after(async () => {
    try {
      await applySubscriptionAccess(result);
    } catch (err) {
      console.error(`[connect-webhook] subscription access failed for ${result.row.id}:`, err);
    }
  });
}

function fulfillInBackground(purchaseId: string | null): void {
  if (!purchaseId) return;
  after(async () => {
    try {
      await fulfillOfferPurchase(purchaseId);
    } catch (err) {
      // Recorded as fulfillmentStatus FAILED; /api/cron/retry-program-purchases retries it.
      console.error(`[connect-webhook] fulfillment failed for purchase ${purchaseId}:`, err);
    }
  });
}

function subscriptionIdOf(session: Stripe.Checkout.Session): string | null {
  const sub = session.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

async function handleEvent(event: Stripe.Event, account: string): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (!parseConnectMetadata(session.metadata)) return;
      if (session.mode === "subscription") {
        const subscriptionId = subscriptionIdOf(session);
        if (subscriptionId) runAccessInBackground(await syncOfferSubscription(subscriptionId, account));
        return;
      }
      fulfillInBackground(await markPurchasePaid(session, account));
      return;
    }
    case "checkout.session.async_payment_failed": {
      await markPurchasePaymentFailed(event.data.object, account);
      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      if (!parseConnectMetadata(sub.metadata)) return;
      runAccessInBackground(await syncOfferSubscription(sub.id, account));
      return;
    }
    case "invoice.paid": {
      runAccessInBackground(await handleOfferInvoicePaid(event.data.object, account));
      return;
    }
    case "invoice.payment_failed": {
      await handleOfferInvoicePaymentFailed(event.data.object, account);
      return;
    }
    case "charge.refunded": {
      await handleChargeRefunded(event.data.object, account);
      return;
    }
    case "charge.dispute.closed": {
      await handleDisputeClosed(event.data.object, account);
      return;
    }
    case "account.updated": {
      await syncConnectedAccountFromStripe(event.data.object);
      return;
    }
    case "account.application.deauthorized": {
      await handleAccountDeauthorized(account);
      return;
    }
    default:
      return;
  }
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[connect-webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not set");
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing stripe-signature header", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    return new NextResponse(`Webhook signature verification failed: ${err}`, { status: 400 });
  }

  // Connect events always name the account; a platform event sent here by
  // mistake (or for an account we don't know) is acknowledged and ignored.
  const account = event.account;
  if (!account) return NextResponse.json({ received: true, ignored: "no_account" });
  if (!(await isKnownConnectAccount(account))) return NextResponse.json({ received: true, ignored: "unknown_account" });

  try {
    await handleEvent(event, account);
  } catch (err) {
    console.error(`[connect-webhook] error processing ${event.type} (${event.id}) for ${account}:`, err);
    return new NextResponse("Internal error", { status: 500 });
  }
  return NextResponse.json({ received: true });
}
