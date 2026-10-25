import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SignIn } from "@clerk/nextjs";
import { getClubBySlug } from "@/lib/services/club.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";

/**
 * "Already have an account?" from the club join page. The app-wide /sign-in
 * always lands on /onboarding (trainer setup), which would drop the join; this
 * keeps every sign-in step on one hash-routed page and returns to /complete.
 */
export default async function JoinSignInPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  // verifyJoinToken throws when CLERK_SECRET_KEY is missing: fail closed (500).
  const verified = verifyJoinToken((await cookies()).get(JOIN_COOKIE)?.value, club.clerkOrgId);
  if (!verified) redirect(`/join/${slug}`);

  const branding = await getOrgBranding(club.clerkOrgId);

  return (
    <>
      <BrandStyle branding={branding} />
      <AuthShell
        branding={toViewModel(branding)}
        headingMode="form"
        headline={`Join ${branding.displayName}`}
        subhead="Sign in to add this club to your account."
      >
        <SignIn
          routing="hash"
          forceRedirectUrl={`/join/${slug}/complete`}
          signUpUrl={`/join/${slug}`}
          appearance={clerkAuthAppearance()}
        />
      </AuthShell>
    </>
  );
}
