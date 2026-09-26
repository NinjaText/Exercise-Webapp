import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { TIER_CONFIG, isValidTier } from "@/lib/stripe-config";
import { getNativeInfo } from "@/lib/native/server";

export async function POST(req: Request) {
  // Defence in depth: no native UI reaches this route, but a crafted request
  // from the shell must not be able to start a subscription checkout either
  // (Apple 3.1.1).
  if ((await getNativeInfo()).isNative) {
    return new NextResponse("Purchases are not available in the app", { status: 403 });
  }

  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json() as { tier?: string };
  if (!body.tier || !isValidTier(body.tier)) {
    return new NextResponse("Invalid tier", { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || user.role !== "TRAINER") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  // Club trainers never pay (trainerBilling off).
  if (!(await getCapabilitiesForUser(user)).trainerBilling) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });
  if (!sub) {
    return new NextResponse("Subscription record not found", { status: 404 });
  }

  if (sub.stripeSubscriptionId && sub.status === "ACTIVE") {
    return new NextResponse("Already subscribed", { status: 409 });
  }

  const session = await stripe.checkout.sessions.create({
    customer: sub.stripeCustomerId,
    payment_method_types: ["card"],
    line_items: [{ price: TIER_CONFIG[body.tier].priceId(), quantity: 1 }],
    mode: "subscription",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/cancel`,
  });

  if (!session.url) {
    return new NextResponse("Checkout session URL unavailable", { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
