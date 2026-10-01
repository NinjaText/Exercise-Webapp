import { getCurrentUser } from "@/lib/current-user";
import { PageShell } from "@/components/shared/page-shell";
import { SettingsHeader } from "@/components/settings/settings-header";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    // One centered column: the header, tabs and every card share the same edges.
    <PageShell className="max-w-5xl">
      <SettingsHeader role={user.role} />
      {children}
    </PageShell>
  );
}
