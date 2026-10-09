import Link from "next/link";
import { redirect } from "next/navigation";
import { isHouseCoach } from "@/lib/services/house-coach.service";
import { getCurrentUser } from "@/lib/current-user";
import { SettingsPanels } from "@/components/settings/settings-section";
import { ProfilePanel } from "@/components/settings/account/profile-panel";
import { EmailPanel } from "@/components/settings/account/email-panel";
import { PasswordPanel } from "@/components/settings/account/password-panel";
import { ConnectedAccountsPanel } from "@/components/settings/account/connected-accounts-panel";
import { SessionsPanel } from "@/components/settings/account/sessions-panel";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  // The Account tab is hidden for house coaches; don't leave it reachable by URL.
  if (await isHouseCoach(user)) redirect("/settings/notifications");

  return (
    <SettingsPanels>
      <ProfilePanel
        initial={{ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" }}
        email={user.email}
      />
      <EmailPanel />
      <PasswordPanel />
      <ConnectedAccountsPanel />
      <SessionsPanel />
      <DeleteAccountSection role={user.role} />

      <nav aria-label="Legal" className="flex gap-4 pt-2 text-caption">
        <Link href="/privacy" className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none">
          Privacy Policy
        </Link>
        <Link href="/terms" className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none">
          Terms of Service
        </Link>
      </nav>
    </SettingsPanels>
  );
}
