import { getCurrentUser } from "@/lib/current-user";
import { hiddenSettingsTabHrefs } from "@/lib/org-capabilities";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { isHouseCoach } from "@/lib/services/house-coach.service";
import { PageShell } from "@/components/shared/page-shell";
import { SettingsHeader } from "@/components/settings/settings-header";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // House coaches never pay, so their Billing tab is hidden like the nav link;
  // they also lose the Account tab (shared login, admin-managed).
  const hiddenHrefs = hiddenSettingsTabHrefs(await getCapabilitiesForUser(user), {
    houseCoach: await isHouseCoach(user),
  });

  return (
    // One centered column: the header, tabs and every card share the same edges.
    <PageShell className="max-w-5xl">
      <SettingsHeader role={user.role} hiddenHrefs={hiddenHrefs} />
      {children}
    </PageShell>
  );
}
