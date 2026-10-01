import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/utils/app-url";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || user.role !== "CLIENT") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
  if (!sub?.stripeCustomerId) {
    return new NextResponse("No subscription found", { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${appBaseUrl()}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
