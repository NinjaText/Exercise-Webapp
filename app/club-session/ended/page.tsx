import { auth } from "@clerk/nextjs/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { getActingAdmin } from "@/lib/clubs/admin-session";
import { ClubSessionEnded } from "./ended-client";

export const metadata = { title: "Club session ended" };

/**
 * Public (spec H9/H10): where the proxy sends a house-coach session that has
 * no valid marker, and where Exit lands. The client signs the house coach out.
 */
export default async function ClubSessionEndedPage() {
  const { userId } = await auth();
  const marker = await getActingAdmin();
  // Only greet the admin when the marker belongs to the signed-in house coach.
  const acting = marker && userId && marker.houseCoachClerkId === userId ? marker : null;
  const branding = toViewModel(await getOrgBranding(null));

  return (
    <AuthShell
      branding={branding}
      headline="Club session ended"
      subhead={
        acting
          ? `${acting.adminName}, you're being signed out of the club.`
          : "Your club session has ended or expired. Sign back in to the admin panel to continue."
      }
      footer={null}
    >
      <ClubSessionEnded />
    </AuthShell>
  );
}
