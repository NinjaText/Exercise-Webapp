import { UserProfile } from "@clerk/nextjs";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";

export default async function SettingsPage() {
  return (
    <PageShell>
      <PageHeader title="Settings" description="Manage your account and profile" />
      <UserProfile appearance={clerkAppearance} />
    </PageShell>
  );
}
