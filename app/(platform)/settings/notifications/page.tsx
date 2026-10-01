import { getMyPreferenceAction } from "@/actions/notification-preference-actions";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { SettingsPanel, SettingsPanels } from "@/components/settings/settings-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default async function NotificationSettingsPage() {
  const preferences = await getMyPreferenceAction();

  if (preferences.ok) return <NotificationPreferencesForm initial={preferences.values} />;

  // Never render the form on a failed read: every toggle would show off,
  // and saving that would mute the user for real.
  return (
    <SettingsPanels>
      <SettingsPanel title="Email delivery" description="Choose which emails you receive.">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>We couldn&apos;t load your notification settings</AlertTitle>
          <AlertDescription>
            Your existing preferences have not changed. Reload the page to try again — if this
            keeps happening, contact support.
          </AlertDescription>
        </Alert>
      </SettingsPanel>
    </SettingsPanels>
  );
}
