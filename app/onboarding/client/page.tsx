import { auth } from "@clerk/nextjs/server";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientOnboardingForm } from "@/components/onboarding/client-onboarding-form";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { resolveClientOnboardingOrgId } from "@/lib/branding/client-onboarding";
import { resolveClubTrainerInvite } from "@/lib/services/club-trainer.service";

export default async function ClientOnboardingPage() {
  const { userId, orgId } = await auth();

  // Unauthenticated: render Clerk's SignUp so it can consume the __clerk_ticket
  // from the invitation URL and complete account creation inline.
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-info-soft px-4 py-12">
        <SignUp routing="hash" forceRedirectUrl="/onboarding/client" />
      </div>
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
    <div className="flex min-h-screen">
      <BrandStyle branding={branding} />
      <div
        className="hidden w-1/2 flex-col justify-between bg-sidebar-gradient p-12 lg:flex"
      >
        <div className="flex items-center gap-2.5">
          <OrgIdentity branding={brandingVm} surface="dark" />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-sidebar-foreground">
            Welcome to your rehabilitation program.
          </h1>
          <p className="mt-4 max-w-md text-lg text-sidebar-foreground/70">
            {personalizeCopy}
          </p>
        </div>
        <p className="text-sm text-sidebar-foreground/40">
          &copy; {new Date().getFullYear()} {branding.displayName}. All rights reserved.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-[oklch(0.97_0.005_247)] p-6 sm:p-12">
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <OrgIdentity branding={brandingVm} surface="light" />
        </div>
        <div className="w-full max-w-lg">
          <ClientOnboardingForm />
        </div>
      </div>
    </div>
  );
}
