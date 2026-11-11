import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ConsentedSignUp } from "@/components/auth/consented-sign-up";
import { getClubBySlug } from "@/lib/services/club.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";
import { isFreeClub } from "@/lib/clubs/free-club";
import { normalizeReferralCode, REFERRAL_COOKIE } from "@/lib/referrals/codes";
import { JoinCodeForm } from "./join-code-form";

export default async function JoinClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const branding = await getOrgBranding(club.clerkOrgId);
  const brandingVm = toViewModel(branding);

  // verifyJoinToken throws when CLERK_SECRET_KEY is missing: fail closed (500).
  // Open-join clubs (e.g. MIA Individuals) skip the access-code step.
  const jar = await cookies();
  const verified = club.openJoin === true || verifyJoinToken(jar.get(JOIN_COOKIE)?.value, club.clerkOrgId);
  // Contractor referral codes only matter where MIA bills the member.
  const referral = isFreeClub(club) ? undefined : { initialCode: normalizeReferralCode(jar.get(REFERRAL_COOKIE)?.value) };
  const completeUrl = `/join/${slug}/complete`;
  const startWhat = isFreeClub(club) ? "join" : "start your free trial";

  return (
    <>
      <BrandStyle branding={branding} />
      {verified ? (
        <AuthShell
          branding={brandingVm}
          headingMode="form"
          headline={`Join ${branding.displayName}`}
          subhead={`Create your account to ${startWhat}.`}
        >
          <ConsentedSignUp
            routing="hash"
            forceRedirectUrl={completeUrl}
            signInUrl={`/join/${slug}/sign-in`}
            signInForceRedirectUrl={completeUrl}
            appearance={clerkAuthAppearance()}
            referral={referral}
          />
        </AuthShell>
      ) : (
        <AuthShell
          branding={brandingVm}
          headline={`Join ${branding.displayName}`}
          subhead={`Enter the access code your club gave you to ${startWhat}.`}
        >
          <JoinCodeForm slug={slug} clubName={branding.displayName} />
        </AuthShell>
      )}
    </>
  );
}
