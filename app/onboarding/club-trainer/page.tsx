import { auth } from "@clerk/nextjs/server";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { getOrgForUser } from "@/lib/org-capabilities.server";
import {
  ensureClubTrainerUser,
  resolveClubTrainerInvite,
  revokeRefusedTrainerMembership,
} from "@/lib/services/club-trainer.service";
import { ClubError } from "@/lib/services/club-error";
import { getOrgBranding } from "@/lib/services/branding.service";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";
import { ClubTrainerOnboardingForm } from "@/components/onboarding/club-trainer-onboarding-form";

/**
 * The club trainer's row, through ensureClubTrainerUser in every case: it
 * creates the row if the webhook hasn't yet, and re-runs the (idempotent)
 * ownership transfer otherwise. A refused account loses the invite's Clerk
 * membership and gets null.
 */
async function loadClubTrainer(clerkUserId: string): Promise<User | null> {
  const existing = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
  const existingOrg = existing?.role === "TRAINER" ? await getOrgForUser(existing) : null;
  const club =
    existingOrg && getOrgCapabilities(existingOrg).billing === "member"
      ? existingOrg
      : await resolveClubTrainerInvite(clerkUserId);
  if (!club) return null;
  try {
    return await ensureClubTrainerUser(clerkUserId, club);
  } catch (err) {
    // Account belongs elsewhere: never move it, and take back the seat.
    if (!(err instanceof ClubError)) throw err;
    await revokeRefusedTrainerMembership(clerkUserId, club.clerkOrgId);
    return null;
  }
}

export default async function ClubTrainerOnboardingPage() {
  const { userId } = await auth();

  // Unauthenticated: Clerk's SignUp consumes the invitation's __clerk_ticket.
  // The club isn't known yet, so product branding (no lookup).
  if (!userId) {
    return (
      <AuthShell
        branding={toViewModel(resolveBranding(null))}
        headingMode="form"
        headline="Welcome, coach."
        subhead="Create your account to accept your club's invitation."
      >
        <SignUp routing="hash" forceRedirectUrl="/onboarding/club-trainer" appearance={clerkAuthAppearance()} />
      </AuthShell>
    );
  }

  const user = await loadClubTrainer(userId);
  const org = user ? await getOrgForUser(user) : null;
  const isClubTrainer = user?.role === "TRAINER" && org !== null && getOrgCapabilities(org).billing === "member";

  if (!user || !org || !isClubTrainer) {
    return (
      <AuthShell branding={toViewModel(resolveBranding(null))} headline="This account isn't a club trainer">
        <p className="text-body text-muted-foreground">
          Club trainers join through the invitation email, using a dedicated account. Sign out and open the
          invitation link again, or contact support.
        </p>
      </AuthShell>
    );
  }

  if (user.onboarded) redirect("/dashboard");

  const branding = await getOrgBranding(org.clerkOrgId);
  const brandingVm = toViewModel(branding);

  return (
    <>
      <BrandStyle branding={branding} />
      <AuthShell
        branding={brandingVm}
        headline={`Welcome to ${branding.displayName}.`}
        subhead="You'll manage the club's programs and coach its members."
      >
        <ClubTrainerOnboardingForm
          clubName={branding.displayName}
          initialFirstName={user.firstName}
          initialLastName={user.lastName}
        />
      </AuthShell>
    </>
  );
}
