import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import { getClubBySlug } from "@/lib/services/club.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";
import { JoinCodeForm } from "./join-code-form";

export default async function JoinClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const branding = await getOrgBranding(club.clerkOrgId);
  const brandingVm = toViewModel(branding);

  // verifyJoinToken throws when CLERK_SECRET_KEY is missing: fail closed (500).
  const verified = verifyJoinToken((await cookies()).get(JOIN_COOKIE)?.value, club.clerkOrgId);
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
          <SignUp
            routing="hash"
            forceRedirectUrl={completeUrl}
            signInForceRedirectUrl={completeUrl}
            appearance={clerkAuthAppearance()}
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
