import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { SettingsPanels } from "@/components/settings/settings-section";
import { ProfilePanel } from "@/components/settings/account/profile-panel";
import { EmailPanel } from "@/components/settings/account/email-panel";
import { PasswordPanel } from "@/components/settings/account/password-panel";
import { ConnectedAccountsPanel } from "@/components/settings/account/connected-accounts-panel";
import { SessionsPanel } from "@/components/settings/account/sessions-panel";
import { getNativeInfo } from "@/lib/native/server";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  const native = await getNativeInfo();

  return (
    <SettingsPanels>
      <ProfilePanel
        initial={{ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" }}
        email={user.email}
      />
      <EmailPanel />
      <PasswordPanel />
      {/* Connecting Google would start OAuth inside the app's web view: blocked
          on Android, and against Apple 4.8's email-only sign-in. Web only. */}
      {!native.isNative && <ConnectedAccountsPanel />}
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
