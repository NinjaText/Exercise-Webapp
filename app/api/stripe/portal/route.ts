import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getNativeInfo } from "@/lib/native/server";

export async function POST() {
  // Defence in depth: no native UI reaches this route, but a crafted request
  // from the shell must not be able to open the billing portal (which allows
  // plan changes and upgrades — a purchase path) either (Apple 3.1.1).
  if ((await getNativeInfo()).isNative) {
    return new NextResponse("Purchases are not available in the app", { status: 403 });
  }

  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

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
    return new NextResponse("No subscription found", { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
