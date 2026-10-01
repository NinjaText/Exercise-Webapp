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
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
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
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-info-soft px-4 py-12">
        <SignUp routing="hash" forceRedirectUrl="/onboarding/club-trainer" />
      </div>
    );
  }

  const user = await loadClubTrainer(userId);
  const org = user ? await getOrgForUser(user) : null;
  const isClubTrainer = user?.role === "TRAINER" && org !== null && getOrgCapabilities(org).billing === "member";

  if (!user || !org || !isClubTrainer) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md space-y-2 text-center">
          <h1 className="text-xl font-semibold text-foreground">This account isn&apos;t a club trainer</h1>
          <p className="text-sm text-muted-foreground">
            Club trainers join through the invitation email, using a dedicated account. Sign out and open the
            invitation link again, or contact support.
          </p>
        </div>
      </div>
    );
  }

  if (user.onboarded) redirect("/dashboard");

  const branding = await getOrgBranding(org.clerkOrgId);
  const brandingVm = toViewModel(branding);

  return (
    <div className="flex min-h-screen">
      <BrandStyle branding={branding} />
      <div className="hidden w-1/2 flex-col justify-between bg-sidebar-gradient p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <OrgIdentity branding={brandingVm} surface="dark" />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-sidebar-foreground">
            Welcome to {branding.displayName}.
          </h1>
          <p className="mt-4 max-w-md text-lg text-sidebar-foreground/70">
            You&apos;ll manage the club&apos;s programs and coach its members.
          </p>
        </div>
        <p className="text-sm text-sidebar-foreground/40">
          &copy; {new Date().getFullYear()} {branding.displayName}. All rights reserved.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-[oklch(0.97_0.005_247)] p-6 sm:p-12">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <OrgIdentity branding={brandingVm} surface="light" />
        </div>
        <div className="w-full max-w-lg">
          <ClubTrainerOnboardingForm
            clubName={branding.displayName}
            initialFirstName={user.firstName}
            initialLastName={user.lastName}
          />
        </div>
      </div>
    </div>
  );
}
