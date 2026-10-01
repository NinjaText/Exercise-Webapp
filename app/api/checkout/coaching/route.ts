import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { evaluateMemberAccess } from "@/lib/billing/access";
import { ensureMemberStripeCustomer } from "@/lib/services/member-billing.service";
import {
  COACHING_PURCHASE_TYPE,
  expireOpenCoachingCheckouts,
  getCoachingForUser,
} from "@/lib/services/coaching.service";
import { activeUserOnly } from "@/lib/auth/active-user";
import { appBaseUrl } from "@/lib/utils/app-url";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!user || user.role !== "CLIENT" || !user.clerkOrgId) return new NextResponse("Forbidden", { status: 403 });

  const org = await prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } });
  if (!org || getOrgCapabilities(org).billing !== "member" || !org.coachingStripePriceId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const coaching = await getCoachingForUser(user.id);
  if (coaching?.status === "ACTIVE" || coaching?.status === "PAST_DUE") {
    return new NextResponse("Coaching is already active", { status: 409 });
  }
  if (!coaching || coaching.status !== "ACCEPTED") {
    return new NextResponse("Your coaching request hasn't been accepted", { status: 409 });
  }
  // The offer was made by this club's trainer; never bill it under another club's price.
  if (coaching.clerkOrgId !== user.clerkOrgId) {
    return new NextResponse("This coaching offer is from a different club", { status: 409 });
  }

  const sub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
  if (!sub) return new NextResponse("Subscription record not found", { status: 404 });
  if (evaluateMemberAccess(sub, new Date()) !== "ok") {
    return new NextResponse("Your membership needs to be in good standing", { status: 409 });
  }

  const customerId = await ensureMemberStripeCustomer(user, sub, org);

  // One open coaching checkout at a time, so two tabs can't both be paid.
  // Expire-then-create (rather than handing back the old session's URL) keeps
  // this simple and always uses the club's current price. If the expiry
  // fails we stop: a duplicate payment would only be caught later by the
  // orphan cancel + refund.
  try {
    await expireOpenCoachingCheckouts(customerId);
  } catch (error) {
    console.error(`[coaching-checkout] could not expire open coaching checkouts for ${user.id}:`, error);
    return new NextResponse("Couldn't start checkout. Please try again.", { status: 503 });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: org.coachingStripePriceId, quantity: 1 }],
    metadata: { purchaseType: COACHING_PURCHASE_TYPE, userId: user.id },
    subscription_data: { metadata: { purchaseType: COACHING_PURCHASE_TYPE, userId: user.id } },
    success_url: `${appBaseUrl()}/billing/success?coaching=1`,
    cancel_url: `${appBaseUrl()}/dashboard`,
  });

  if (!session.url) return new NextResponse("Checkout session URL unavailable", { status: 500 });
  return NextResponse.json({ url: session.url });
}
