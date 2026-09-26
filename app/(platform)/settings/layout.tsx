import { getCurrentUser } from "@/lib/current-user";
import { hiddenNavHrefs } from "@/lib/org-capabilities";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getNativeInfo } from "@/lib/native/server";
import { withNativeHidden } from "@/components/layout/nav-items";
import { PageShell } from "@/components/shared/page-shell";
import { SettingsHeader } from "@/components/settings/settings-header";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Club trainers never pay, so their Billing tab is hidden like the nav link;
  // inside the native app it's hidden for everyone (Apple 3.1.1).
  const hiddenHrefs = withNativeHidden(
    hiddenNavHrefs(await getCapabilitiesForUser(user)),
    (await getNativeInfo()).isNative
  );

  return (
    // One centered column: the header, tabs and every card share the same edges.
    <PageShell className="max-w-5xl">
      <SettingsHeader role={user.role} hiddenHrefs={hiddenHrefs} />
      {children}
    </PageShell>
  );
}
