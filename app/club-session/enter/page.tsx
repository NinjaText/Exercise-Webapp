import { AuthShell } from "@/components/auth/auth-shell";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { EnterClubSession } from "./enter-client";

export const metadata = { title: "Opening club" };

/**
 * Public (spec H7): the single-use sign-in ticket minted by enterClubAction is
 * the credential. The client swaps the admin's session for the house coach's.
 */
export default async function EnterClubSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { ticket } = await searchParams;
  const branding = toViewModel(await getOrgBranding(null));

  return (
    <AuthShell branding={branding} headline="Opening club" footer={null}>
      <EnterClubSession ticket={ticket ?? null} />
    </AuthShell>
  );
}
