import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";
import { getCurrentUser } from "@/lib/current-user";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <PageShell>
      <PageHeader title="Settings" description="Manage your account and profile" />
      <UserProfile appearance={clerkAppearance} />

      <nav aria-label="Legal" className="flex gap-4 text-sm text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
      </nav>

      <DeleteAccountSection role={user.role} />
    </PageShell>
  );
}
