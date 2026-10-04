import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getClubBySlug } from "@/lib/services/club.service";
import { getClubTrainer } from "@/lib/services/club-trainer.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { AuthShell } from "@/components/auth/auth-shell";
import { NativeAwareSignUp } from "@/components/auth/native-aware-auth";
import { getNativeInfo } from "@/lib/native/server";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";
import { JoinCodeForm } from "./join-code-form";
import { ClubNotOpen } from "./club-not-open";

export default async function JoinClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const branding = await getOrgBranding(club.clerkOrgId);
  const brandingVm = toViewModel(branding);
  if (!(await getClubTrainer(club.clerkOrgId))) {
    return (
      <>
        <BrandStyle branding={branding} />
        <AuthShell branding={brandingVm} headline="Not open yet">
          <ClubNotOpen />
        </AuthShell>
      </>
    );
  }

  // verifyJoinToken throws when CLERK_SECRET_KEY is missing: fail closed (500).
  const verified = verifyJoinToken((await cookies()).get(JOIN_COOKIE)?.value, club.clerkOrgId);
  const { isNative } = await getNativeInfo();
  const completeUrl = `/join/${slug}/complete`;

  return (
    <>
      <BrandStyle branding={branding} />
      {verified ? (
        <AuthShell
          branding={brandingVm}
          headingMode="form"
          headline={`Join ${branding.displayName}`}
          subhead="Create your account to start your free trial."
        >
          {/* Email-only inside the native app (Apple 4.8; Google blocks OAuth in web views). */}
          <NativeAwareSignUp
            nativeFromServer={isNative}
            routing="hash"
            forceRedirectUrl={completeUrl}
            signInForceRedirectUrl={completeUrl}
          />
        </AuthShell>
      ) : (
        <AuthShell
          branding={brandingVm}
          headline={`Join ${branding.displayName}`}
          subhead="Enter the access code your club gave you to start your free trial."
        >
          <JoinCodeForm slug={slug} clubName={branding.displayName} />
        </AuthShell>
      )}
    </>
  );
}
