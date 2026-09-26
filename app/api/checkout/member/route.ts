import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getNativeInfo } from "@/lib/native/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { MEMBER_PURCHASE_TYPE, ensureMemberStripeCustomer } from "@/lib/services/member-billing.service";
import { appBaseUrl } from "@/lib/utils/app-url";
import { hasScheduledSubscription } from "@/lib/billing/access";
import { activeUserOnly } from "@/lib/auth/active-user";

const TRIAL_END_MIN_LEAD_MS = 48 * 60 * 60 * 1000;

export async function POST() {
  // Defence in depth: no native UI reaches this route, but a crafted request
  // from the shell must not be able to start a purchase either (Apple 3.1.1).
  if ((await getNativeInfo()).isNative) {
    return new NextResponse("Purchases are not available in the app", { status: 403 });
  }

  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  // A deactivated member can't use the app, so they can't start paying for it.
  const user = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!user || user.role !== "CLIENT" || !user.clerkOrgId) return new NextResponse("Forbidden", { status: 403 });

  const org = await prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } });
  if (!org || getOrgCapabilities(org).billing !== "member") return new NextResponse("Forbidden", { status: 403 });
  if (!org.stripePriceId) return new NextResponse("Club has no price configured", { status: 409 });

  const sub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
  if (!sub) return new NextResponse("Subscription record not found", { status: 404 });
  if (sub.status === "ACTIVE" || hasScheduledSubscription(sub)) {
    return new NextResponse("Already subscribed", { status: 409 });
  }
  // A second subscription would let the old one's events clobber the new one.
  if (sub.stripeSubscriptionId && (sub.status === "PAST_DUE" || sub.status === "UNPAID")) {
    return new NextResponse(
      "Your subscription has a payment issue — use Manage billing to update your card.",
      { status: 409 }
    );
  }

  // Reuse the customer on resubscribe so billing history stays in one place.
  const customerId = await ensureMemberStripeCustomer(user, sub, org);

  // Subscribing early keeps the rest of the free trial: Stripe bills at its end.
  // Stripe requires trial_end ≥ 48h out, so a trial about to end bills now.
  const keepTrial = sub.status === "TRIALING" && sub.trialEndsAt.getTime() - Date.now() > TRIAL_END_MIN_LEAD_MS;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: org.stripePriceId, quantity: 1 }],
    metadata: { purchaseType: MEMBER_PURCHASE_TYPE, userId: user.id },
    subscription_data: {
      metadata: { purchaseType: MEMBER_PURCHASE_TYPE, userId: user.id },
      ...(keepTrial ? { trial_end: Math.floor(sub.trialEndsAt.getTime() / 1000) } : {}),
    },
    success_url: `${appBaseUrl()}/billing/success`,
    cancel_url: `${appBaseUrl()}/billing?reason=canceled_checkout`,
  });

  if (!session.url) return new NextResponse("Checkout session URL unavailable", { status: 500 });
  return NextResponse.json({ url: session.url });
}
