import { redirect, notFound } from "next/navigation";
import { after } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { getClubBySlug } from "@/lib/services/club.service";
import {
  enrollClubMember,
  assignNextStarterProgram,
  clubRequiresCardForTrial,
} from "@/lib/services/club-member.service";
import { prisma } from "@/lib/prisma";
import { awaitingFirstCheckout } from "@/lib/billing/access";
import { isFreeClub } from "@/lib/clubs/free-club";
import { attributeReferralFromRequest } from "@/lib/referrals/attribution";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";
import { AuthShell } from "@/components/auth/auth-shell";
import { BrandStyle } from "@/components/branding/brand-style";
import { getOrgBranding } from "@/lib/services/branding.service";
import type { ResolvedBranding } from "@/lib/branding/types";
import { toViewModel } from "@/lib/branding/types";
import { ActivateOrg } from "./activate-org";

function JoinStatusShell({
  branding, headline, subhead, children,
}: {
  branding: ResolvedBranding;
  headline: string;
  subhead?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <BrandStyle branding={branding} />
      <AuthShell branding={toViewModel(branding)} headline={headline} subhead={subhead}>
        {children}
      </AuthShell>
    </>
  );
}

export default async function JoinCompletePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const { userId } = await auth();
  if (!userId) redirect(`/join/${slug}`);

  // verifyJoinToken throws when CLERK_SECRET_KEY is missing: fail closed (500).
  const token = (await cookies()).get(JOIN_COOKIE)?.value;
  if (club.openJoin !== true && !verifyJoinToken(token, club.clerkOrgId)) redirect(`/join/${slug}`);

  const result = await enrollClubMember({ clerkUserId: userId, club });
  if (!result.ok) {
    return (
      <JoinStatusShell
        branding={await getOrgBranding(club.clerkOrgId)}
        headline="This email is already linked to another account"
        subhead="Use a different email to join this club."
      >
        <p className="text-body text-muted-foreground">
          Sign out and join with a different email, or contact support if you think this is a mistake.
        </p>
      </JoinStatusShell>
    );
  }

  // Contractor referral (link cookie or code typed at sign-up). Free clubs
  // never bill, so there is nothing to earn on. Never blocks the join.
  if (!isFreeClub(club)) {
    try {
      const [member, clerkUser] = await Promise.all([
        prisma.user.findUnique({
          where: { id: result.userId },
          select: { id: true, email: true, firstName: true, lastName: true, billingExemptAt: true },
        }),
        currentUser(),
      ]);
      if (member) {
        await attributeReferralFromRequest({
          user: member,
          subscriberType: "INDIVIDUAL",
          clerkUnsafeMetadata: clerkUser?.unsafeMetadata,
        });
      }
    } catch (err) {
      console.error("[referrals] club join attribution failed:", err);
    }
  }

  // Copying a program can take ~20s — don't hold the page. The
  // club-starter-programs cron retries anything that fails here.
  const memberId = result.userId;
  after(async () => {
    try {
      await assignNextStarterProgram(memberId);
    } catch (err) {
      console.error("Starter program assignment failed (background):", err);
    }
  });

  // The cookie can't be cleared in a server component; it expires in ≤30 min
  // and is only valid for this club, so leaving it is harmless.
  // Card-required clubs: straight to Stripe Checkout (the trial starts there);
  // onboarding follows once checkout is done (the app gate sends them there).
  let next = "/onboarding/client";
  if (clubRequiresCardForTrial(club)) {
    const sub = await prisma.memberSubscription.findUnique({ where: { userId: memberId } });
    if (awaitingFirstCheckout(sub)) next = `/join/${slug}/checkout`;
  }
  return <ActivateOrg organizationId={club.clerkOrgId} next={next} />;
}
