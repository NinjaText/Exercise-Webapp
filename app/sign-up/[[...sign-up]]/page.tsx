import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";

export default async function SignUpPage() {
  const branding = toViewModel(await getOrgBranding(null));

  return (
    <AuthShell
      branding={branding}
      headingMode="form"
      headline="Create your account"
      subhead="Start your free trial today."
      bullets={[
        "Build and assign exercise programs in minutes",
        "Track client progress, check-ins and adherence",
        "Message clients and keep everyone on plan",
      ]}
    >
      <SignUp forceRedirectUrl="/onboarding" appearance={clerkAuthAppearance()} />
    </AuthShell>
  );
}
