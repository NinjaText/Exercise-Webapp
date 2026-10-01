import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { resolveClubTrainerInvite } from "@/lib/services/club-trainer.service";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // If already onboarded, redirect to dashboard
  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user?.onboarded) redirect("/dashboard");
  // An invited club trainer never goes through trainer-org signup.
  if (user?.role === "TRAINER" && (await getCapabilitiesForUser(user)).billing === "member") {
    redirect("/onboarding/club-trainer");
  }
  // No row yet (webhook pending) but invited as a club trainer.
  if (!user && (await resolveClubTrainerInvite(userId))) redirect("/onboarding/club-trainer");

  // A new trainer has no org yet: product branding (no DB read).
  const branding = toViewModel(resolveBranding(null));

  return (
    <AuthShell
      branding={branding}
      size="wide"
      headline="Set up your organization"
      subhead="Create personalized programs in minutes, track client adherence, and monitor outcomes, all in one platform."
      bullets={[
        "Build and assign exercise programs in minutes",
        "Track client progress, check-ins and adherence",
        "Message clients and keep everyone on plan",
      ]}
    >
      <OnboardingForm />
    </AuthShell>
  );
}
