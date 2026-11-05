import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { isValidTier } from "@/lib/stripe-config";
import { createTrainerCheckoutSession } from "@/lib/services/stripe-billing.service";

export async function POST(req: Request) {
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
  // House coaches never pay (trainerBilling off).
  if (!(await getCapabilitiesForUser(user)).trainerBilling) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const result = await createTrainerCheckoutSession(user.id, body.tier);
  if (!result.ok) return new NextResponse(result.error, { status: result.status });
  return NextResponse.json({ url: result.url });
}
