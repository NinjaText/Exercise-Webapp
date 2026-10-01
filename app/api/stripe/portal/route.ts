import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";

export async function POST() {
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
