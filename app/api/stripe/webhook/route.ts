import { NextResponse, after } from "next/server";
import * as React from "react";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  syncSubscriptionFromStripe,
  activateSubscriptionFromCheckout,
} from "@/lib/services/stripe-billing.service";
import { fulfillProgramPurchase } from "@/lib/services/program-purchase.service";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { sendEmail } from "@/lib/email/send";
import { RefundProcessedEmail } from "@/lib/email/templates/refund-processed";
import { appBaseUrl } from "@/lib/utils/app-url";
import { formatStripeAmount } from "@/lib/utils/money";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new NextResponse(`Webhook signature verification failed: ${err}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.purchaseType === "program") {
          // Fulfillment (account creation + program clone) can take many
          // seconds for a large program — too slow to make Stripe wait on.
          // Ack the webhook immediately and run fulfillment via `after()`;
          // errors there can no longer be signaled to Stripe via retry, so we
          // mark the purchase FAILED for the /api/cron/retry-program-purchases
          // sweep to pick up instead.
          const input = {
            id: session.id,
            email: session.customer_details?.email ?? session.customer_email ?? null,
            amountTotal: session.amount_total,
            currency: session.currency,
            packageIds: (session.metadata.packageIds ?? "").split(",").filter(Boolean),
          };
          after(async () => {
            try {
              await fulfillProgramPurchase(input);
            } catch (err) {
              console.error("fulfillProgramPurchase failed (background):", err);
              await prisma.programPurchase
                .updateMany({
                  where: { stripeCheckoutSessionId: input.id, status: { not: "COMPLETED" } },
                  data: { status: "FAILED" },
                })
                .catch(() => {});
            }
          });
        } else {
          await activateSubscriptionFromCheckout(session);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscriptionFromStripe(sub.customer as string, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // A trainer who deleted their account no longer has a
        // TrainerSubscription row. `update` would throw P2025 -> 500 -> days of
        // Stripe retries, so check first and ignore events for customers we no
        // longer track. When the row exists, update it and notify as usual.
        const canceledRow = await prisma.trainerSubscription.findUnique({
          where: { stripeCustomerId: sub.customer as string },
          select: { id: true },
        });
        if (!canceledRow) break;
        const updated = await prisma.trainerSubscription.update({
          where: { stripeCustomerId: sub.customer as string },
          data: { status: "CANCELED" },
          select: {
            trainerId: true,
            trainer: { select: { email: true, firstName: true, lastName: true } },
          },
        });
        after(async () => {
          try {
            await notifyUser({
              userId: updated.trainerId,
              type: NOTIFICATION_TYPES.SUBSCRIPTION_CANCELED,
              title: "Subscription canceled",
              body: "Your subscription has been canceled.",
              link: "/settings/billing",
              recipientEmail: updated.trainer.email,
              recipientName: `${updated.trainer.firstName} ${updated.trainer.lastName}`,
              email: { billingLink: `${appBaseUrl()}/settings/billing` },
            });
          } catch (err) {
            console.error("subscription-canceled notify failed:", err);
          }
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Same guard as above: tolerate a trainer who deleted their account.
        const pastDueRow = await prisma.trainerSubscription.findUnique({
          where: { stripeCustomerId: invoice.customer as string },
          select: { id: true },
        });
        if (!pastDueRow) break;
        const updated = await prisma.trainerSubscription.update({
          where: { stripeCustomerId: invoice.customer as string },
          data: { status: "PAST_DUE" },
          select: {
            trainerId: true,
            trainer: { select: { email: true, firstName: true, lastName: true } },
          },
        });
        const rawAmountDue = invoice.amount_due ?? 0;
        const invoiceCurrency = invoice.currency ?? "usd";
        after(async () => {
          try {
            const amountDue = formatStripeAmount(rawAmountDue, invoiceCurrency);
            await notifyUser({
              userId: updated.trainerId,
              type: NOTIFICATION_TYPES.PAYMENT_FAILED,
              title: "Payment failed",
              body: `We could not process your payment of ${amountDue}. Your subscription is past due.`,
              link: "/settings/billing",
              recipientEmail: updated.trainer.email,
              recipientName: `${updated.trainer.firstName} ${updated.trainer.lastName}`,
              email: { amountDue, billingLink: `${appBaseUrl()}/settings/billing` },
            });
          } catch (err) {
            console.error("payment-failed notify failed:", err);
          }
        });
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId = charge.payment_intent as string | null;
        if (piId) {
          // Find the checkout session for this payment intent
          const sessions = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 });
          const sessionId = sessions.data[0]?.id;
          if (sessionId) {
            const purchase = await prisma.programPurchase.findUnique({
              where: { stripeCheckoutSessionId: sessionId },
            });
            if (purchase && purchase.assignedProgramIds.length > 0) {
              await prisma.program.updateMany({
                where: { id: { in: purchase.assignedProgramIds } },
                data: { status: "PAUSED" },
              });
              await prisma.programPurchase.update({
                where: { id: purchase.id },
                data: { status: "REFUNDED" },
              });

              const rawAmountRefunded = charge.amount_refunded ?? 0;
              const chargeCurrency = charge.currency ?? "usd";
              const programCount = purchase.assignedProgramIds.length;
              const buyerUserId = purchase.buyerUserId;
              const buyerEmail = purchase.buyerEmail;

              after(async () => {
                try {
                  const amount = formatStripeAmount(rawAmountRefunded, chargeCurrency);
                  if (buyerUserId) {
                    await notifyUser({
                      userId: buyerUserId,
                      type: NOTIFICATION_TYPES.REFUND_PROCESSED,
                      title: "Refund processed",
                      body: `Your refund of ${amount} has been processed.`,
                      link: "/programs",
                      email: { amount, programCount },
                    });
                  } else {
                    // The buyer never claimed their account, so there is no
                    // in-app recipient — email the purchase address directly.
                    await sendEmail({
                      to: buyerEmail,
                      subject: "Your refund has been processed",
                      react: React.createElement(RefundProcessedEmail, {
                        recipientName: "there",
                        amount,
                        programCount,
                      }),
                    });
                  }
                } catch (err) {
                  console.error("refund notify failed:", err);
                }
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    return new NextResponse("Internal error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
