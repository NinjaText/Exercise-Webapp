import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";

export default async function SignInPage() {
  const branding = toViewModel(await getOrgBranding(null));

  return (
    <AuthShell
      branding={branding}
      headingMode="form"
      headline="Welcome back"
      subhead="Sign in to manage your clients and programs."
    >
      <SignIn forceRedirectUrl="/onboarding" appearance={clerkAuthAppearance()} />
    </AuthShell>
  );
}
