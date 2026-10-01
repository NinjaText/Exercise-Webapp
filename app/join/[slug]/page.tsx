import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import { getClubBySlug } from "@/lib/services/club.service";
import { getClubTrainer } from "@/lib/services/club-trainer.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";
import { JoinCodeForm } from "./join-code-form";
import { ClubNotOpen } from "./club-not-open";

export default async function JoinClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const branding = await getOrgBranding(club.clerkOrgId);
  if (!(await getClubTrainer(club.clerkOrgId))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-12">
        <BrandStyle branding={branding} />
        <OrgIdentity branding={toViewModel(branding)} surface="light" />
        <ClubNotOpen />
      </div>
    );
  }

  // verifyJoinToken throws when CLERK_SECRET_KEY is missing: fail closed (500).
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
