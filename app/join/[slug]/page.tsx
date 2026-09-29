import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import { getClubBySlug } from "@/lib/services/club.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";
import { JoinCodeForm } from "./join-code-form";

export default async function JoinClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const branding = await getOrgBranding(club.clerkOrgId);
  // verifyJoinToken throws when CLUB_JOIN_SECRET is missing: fail closed (500).
  const verified = verifyJoinToken((await cookies()).get(JOIN_COOKIE)?.value, club.clerkOrgId);
  const completeUrl = `/join/${slug}/complete`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <BrandStyle branding={branding} />
      <OrgIdentity branding={toViewModel(branding)} surface="light" />
      {verified ? (
        <SignUp
          routing="hash"
          forceRedirectUrl={completeUrl}
          signInForceRedirectUrl={completeUrl}
        />
      ) : (
        <JoinCodeForm slug={slug} clubName={branding.displayName} />
      )}
    </div>
  );
}
