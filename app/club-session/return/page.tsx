import { AuthShell } from "@/components/auth/auth-shell";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { EnterClubSession } from "../enter/enter-client";

export const metadata = { title: "Returning to admin" };

/**
 * Public: where the house coach's Exit lands. The single-use sign-in ticket
 * minted by exitClubAction (only for the admin who opened the visit) signs the
 * browser back in as that admin, so Exit returns to /admin without a login.
 */
export default async function ReturnToAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { ticket } = await searchParams;
  const branding = toViewModel(await getOrgBranding(null));

  return (
    <AuthShell branding={branding} headline="Returning to admin" footer={null}>
      <EnterClubSession
        ticket={ticket ?? null}
        redirectTo="/admin/clubs"
        pendingMessage="Signing you back in to the admin panel…"
        failedMessage="We couldn't sign you back in automatically. Please sign in to the admin panel again."
        backHref="/sign-in?redirect_url=%2Fadmin"
        backLabel="Sign in"
      />
    </AuthShell>
  );
}
