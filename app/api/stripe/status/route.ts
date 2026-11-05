import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { TRAINER_PURCHASE_TYPE, activateSubscriptionFromCheckout } from "@/lib/services/stripe-billing.service";
import { MEMBER_PURCHASE_TYPE, activateMemberFromCheckout } from "@/lib/services/member-billing.service";

/**
 * /billing/success passes Stripe's `session_id`. If the webhook hasn't synced
 * the subscription yet, sync it here from the completed session — but only
 * for a session on the caller's own Stripe customer. Best-effort: the webhook
 * remains the source of truth and is idempotent with this.
 */
async function syncFromSession(sessionId: string, customerId: string | null | undefined, kind: "trainer" | "member") {
  if (!customerId || !sessionId.startsWith("cs_")) return;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "complete" || session.mode !== "subscription" || !session.subscription) return;
    if (session.customer !== customerId) return;
    const purchaseType = session.metadata?.purchaseType;
    if (kind === "member" && purchaseType === MEMBER_PURCHASE_TYPE) await activateMemberFromCheckout(session);
    if (kind === "trainer" && (!purchaseType || purchaseType === TRAINER_PURCHASE_TYPE)) {
      await activateSubscriptionFromCheckout(session);
    }
  } catch (err) {
    console.error("[stripe/status] session sync failed (webhook will catch up):", err);
  }
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) return new NextResponse("User not found", { status: 404 });
  const sessionId = new URL(req.url).searchParams.get("session_id");

  // Club members poll this after checkout too; same `{ subscription: { status } }` shape.
  if (user.role === "CLIENT") {
    let subscription = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
    if (sessionId && subscription && !subscription.stripeSubscriptionId) {
      await syncFromSession(sessionId, subscription.stripeCustomerId, "member");
      subscription = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
    }
    // Coaching is polled for after its own checkout (?coaching=1); membership-only callers ignore it.
    const coaching = await prisma.memberCoaching.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    return NextResponse.json({ subscription, coaching });
  }

  let subscription = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });
  if (sessionId && subscription && (!subscription.stripeSubscriptionId || subscription.status === "CANCELED")) {
    await syncFromSession(sessionId, subscription.stripeCustomerId, "trainer");
    subscription = await prisma.trainerSubscription.findUnique({ where: { trainerId: user.id } });
  }

  return NextResponse.json({ subscription });
}
