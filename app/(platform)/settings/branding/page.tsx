import { requireRole } from "@/lib/current-user";
import { getBrandingSettings } from "@/actions/branding-actions";
import { BrandingForm } from "@/components/settings/branding-form";
import { SettingsPanel, SettingsPanels } from "@/components/settings/settings-section";
import { EmptyState } from "@/components/shared/empty-state";
import { isOwnAssetUrl } from "@/lib/branding/asset-kinds";
import { AlertTriangle, Building2 } from "lucide-react";

const TITLE = "Branding";
const DESCRIPTION = "Your organization's look across the app, PDFs and emails your clients receive.";

function Unavailable({ icon, title, description }: { icon: typeof Building2; title: string; description: string }) {
  return (
    <SettingsPanels>
      <SettingsPanel title={TITLE} description={DESCRIPTION}>
        <EmptyState icon={icon} title={title} description={description} />
      </SettingsPanel>
    </SettingsPanels>
  );
}

export default async function BrandingSettingsPage() {
  const trainer = await requireRole("TRAINER");

  if (!trainer.clerkOrgId) {
    return (
      <Unavailable
        icon={Building2}
        title="No organization set up"
        description="Set up your organization to customize its branding."
      />
    );
  }

  const settings = await getBrandingSettings();
  if (!settings) {
    return (
      <Unavailable
        icon={AlertTriangle}
        title="We couldn't load your branding settings"
        description="Nothing has changed. Reload the page to try again."
      />
    );
  }

  return (
    <BrandingForm
      initial={settings}
      // isOwnAssetUrl reads a server-only env var, so the check happens here, not in the client form.
      ownAssets={{
        "logo-on-light": isOwnAssetUrl(settings.assets.logoOnLightUrl),
        "logo-on-dark": isOwnAssetUrl(settings.assets.logoOnDarkUrl),
        mark: isOwnAssetUrl(settings.assets.markUrl),
      }}
    />
  );
}
