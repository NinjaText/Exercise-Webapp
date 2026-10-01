import { getCurrentUser } from "@/lib/current-user";
import { hiddenNavHrefs } from "@/lib/org-capabilities";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { PageShell } from "@/components/shared/page-shell";
import { SettingsHeader } from "@/components/settings/settings-header";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Club trainers never pay, so their Billing tab is hidden like the nav link.
  const hiddenHrefs = hiddenNavHrefs(await getCapabilitiesForUser(user));

  return (
    // One centered column: the header, tabs and every card share the same edges.
    <PageShell className="max-w-5xl">
      <SettingsHeader role={user.role} hiddenHrefs={hiddenHrefs} />
      {children}
    </PageShell>
  );
}
