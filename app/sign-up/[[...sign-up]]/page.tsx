import { cookies } from "next/headers";
import { ConsentedSignUp } from "@/components/auth/consented-sign-up";
import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { normalizeReferralCode, REFERRAL_COOKIE } from "@/lib/referrals/codes";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const branding = toViewModel(await getOrgBranding(null));
  // Invitation sign-ups (Clerk ticket) are a trainer's clients — never referrals.
  const invited = Boolean((await searchParams).__clerk_ticket);
  const referralCode = normalizeReferralCode((await cookies()).get(REFERRAL_COOKIE)?.value);

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
      <ConsentedSignUp
        forceRedirectUrl="/onboarding"
        appearance={clerkAuthAppearance()}
        referral={invited ? undefined : { initialCode: referralCode }}
      />
    </AuthShell>
  );
}
