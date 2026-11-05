import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { createMemberCheckoutSession } from "@/lib/services/member-billing.service";
import { activeUserOnly } from "@/lib/auth/active-user";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  // A deactivated member can't use the app, so they can't start paying for it.
  const user = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!user || user.role !== "CLIENT" || !user.clerkOrgId) return new NextResponse("Forbidden", { status: 403 });

  const org = await prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } });
  if (!org || getOrgCapabilities(org).billing !== "member") return new NextResponse("Forbidden", { status: 403 });

  const result = await createMemberCheckoutSession(user, org);
  if (!result.ok) return new NextResponse(result.error, { status: result.status });
  return NextResponse.json({ url: result.url });
}
