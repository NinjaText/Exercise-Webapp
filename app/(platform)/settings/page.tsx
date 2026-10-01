import Link from "next/link";
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

      <nav aria-label="Legal" className="flex gap-4 pt-2 text-sm text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
      </nav>
    </SettingsPanels>
  );
}
