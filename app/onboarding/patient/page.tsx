import { auth } from "@clerk/nextjs/server";
import { ConsentedSignUp } from "@/components/auth/consented-sign-up";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientOnboardingForm } from "@/components/onboarding/client-onboarding-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";

/**
 * Legacy alias of /onboarding/client (older invitation links): the same
 * client form with product branding, and signed-out visitors continue to
 * /onboarding/client after SignUp.
 */
export default async function ClientOnboardingPage() {
  const { userId } = await auth();
  const branding = toViewModel(resolveBranding(null));

  // Unauthenticated: render Clerk's SignUp so it can consume the __clerk_ticket
  // from the invitation URL and complete account creation inline.
  if (!userId) {
    return (
      <AuthShell
        branding={branding}
        headingMode="form"
        headline="Welcome to MIA Performance."
        subhead="Create your account to accept your invitation."
      >
        <ConsentedSignUp routing="hash" forceRedirectUrl="/onboarding/client" appearance={clerkAuthAppearance()} />
      </AuthShell>
    );
  }

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user?.onboarded) redirect("/dashboard");

  return (
    <AuthShell
      branding={branding}
      size="wide"
      headline="Welcome to MIA Performance."
      subhead="Complete your profile so your coach can personalize your program."
    >
      <ClientOnboardingForm />
    </AuthShell>
  );
}
