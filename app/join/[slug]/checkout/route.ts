import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeUserOnly } from "@/lib/auth/active-user";
import { getClubBySlug } from "@/lib/services/club.service";
import { createMemberCheckoutSession } from "@/lib/services/member-billing.service";

/**
 * Card-required clubs: right after enrollment the new member goes straight to
 * Stripe Checkout, where their trial starts. Any problem (already subscribed,
 * Stripe down) falls back to /billing, which shows the same Subscribe button.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fallback = () => NextResponse.redirect(new URL("/billing", req.url), 303);

  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL(`/join/${slug}`, req.url), 303);

  const club = await getClubBySlug(slug);
  const user = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!club || !user || user.role !== "CLIENT" || user.clerkOrgId !== club.clerkOrgId) return fallback();

  try {
    const result = await createMemberCheckoutSession(user, club);
    if (result.ok) return NextResponse.redirect(result.url, 303);
  } catch (err) {
    console.error("Join checkout failed:", err);
  }
  return fallback();
}
