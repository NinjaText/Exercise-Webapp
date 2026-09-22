import { getMyPreferenceAction } from "@/actions/notification-preference-actions";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function NotificationSettingsPage() {
  const preferences = await getMyPreferenceAction();

  return (
    <PageShell width="narrow">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Settings
          </Link>
        </Button>
        <PageHeader
          title="Notifications"
          description="Choose which emails you receive. In-app notifications are always on."
          className="pb-0"
        />
      </div>
      {preferences.ok ? (
        <NotificationPreferencesForm initial={preferences.values} />
      ) : (
        // Never render the form on a failed read: every toggle would show off,
        // and saving that would mute the user for real.
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>We couldn&apos;t load your notification settings</AlertTitle>
          <AlertDescription>
            Your existing preferences have not changed. Reload the page to try again — if this
            keeps happening, contact support.
          </AlertDescription>
        </Alert>
      )}
    </PageShell>
  );
}
