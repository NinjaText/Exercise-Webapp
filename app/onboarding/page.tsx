import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import type { User } from "@prisma/client";

async function needsTrainerSubscription(user: User): Promise<boolean> {
  if (user.role !== "TRAINER") return false;
  if ((await getCapabilitiesForUser(user)).billing !== "trainer") return false;
  return !(await prisma.trainerSubscription.findUnique({ where: { trainerId: user.id } }));
}

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // If already onboarded, redirect to dashboard — unless a trainer's signup
  // never got its trial subscription (the platform layout sends them back here).
  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user?.onboarded && !(await needsTrainerSubscription(user))) redirect("/dashboard");

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
