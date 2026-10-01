import { auth } from "@clerk/nextjs/server";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientOnboardingForm } from "@/components/onboarding/client-onboarding-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { BrandStyle } from "@/components/branding/brand-style";
import { getOrgBranding } from "@/lib/services/branding.service";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";
import { resolveClientOnboardingOrgId } from "@/lib/branding/client-onboarding";
import { resolveClubTrainerInvite } from "@/lib/services/club-trainer.service";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";

export default async function ClientOnboardingPage() {
  const { userId, orgId } = await auth();

  // Unauthenticated: render Clerk's SignUp so it can consume the __clerk_ticket
  // from the invitation URL and complete account creation inline. The org
  // isn't known yet, so product branding (no lookup).
  if (!userId) {
    return (
      <AuthShell
        branding={toViewModel(resolveBranding(null))}
        headingMode="form"
        headline="Welcome to your rehabilitation program."
        subhead="Create your account to accept your invitation."
      >
        <SignUp routing="hash" forceRedirectUrl="/onboarding/client" appearance={clerkAuthAppearance()} />
      </AuthShell>
    );
  }

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user?.onboarded) redirect("/dashboard");
  // No row yet and this is an invited club trainer: never the client form
  // (completeClientOnboarding would create a CLIENT).
  if (!user && (await resolveClubTrainerInvite(userId))) redirect("/onboarding/club-trainer");

  const branding = await getOrgBranding(resolveClientOnboardingOrgId(user, orgId ?? null));
  const brandingVm = toViewModel(branding);
  const personalizeCopy = branding.enabled
    ? `Complete your profile so ${branding.displayName} can personalize your exercise program.`
    : "Complete your profile so your trainer can personalize your exercise program.";

  return (
    <>
      <BrandStyle branding={branding} />
      <AuthShell
        branding={brandingVm}
        size="wide"
        headline="Welcome to your rehabilitation program."
        subhead={personalizeCopy}
      >
        <ClientOnboardingForm />
      </AuthShell>
    </>
  );
}
