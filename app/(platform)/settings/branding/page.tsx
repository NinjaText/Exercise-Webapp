import { requireRole } from "@/lib/current-user";
import { getBrandingSettings } from "@/actions/branding-actions";
import { BrandingForm } from "@/components/settings/branding-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { isOwnAssetUrl } from "@/lib/branding/asset-kinds";
import { AlertTriangle, Building2 } from "lucide-react";

const TITLE = "Branding";
const DESCRIPTION = "Your organization's look across the app, PDFs and emails your clients receive.";
const BACK = { label: "Back to Settings", href: "/settings" };

export default async function BrandingSettingsPage() {
  const trainer = await requireRole("TRAINER");

  if (!trainer.clerkOrgId) {
    return (
      <PageShell width="narrow">
        <PageHeader title={TITLE} description={DESCRIPTION} back={BACK} />
        <EmptyState
          icon={Building2}
          title="No organization set up"
          description="Set up your organization to customize its branding."
        />
      </PageShell>
    );
  }

  const settings = await getBrandingSettings();

  return (
    <PageShell width="narrow">
      <PageHeader title={TITLE} description={DESCRIPTION} back={BACK} />
      {settings ? (
        <BrandingForm
          initial={settings}
          // isOwnAssetUrl reads a server-only env var, so the check happens here, not in the client form.
          ownAssets={{
            "logo-on-light": isOwnAssetUrl(settings.assets.logoOnLightUrl),
            "logo-on-dark": isOwnAssetUrl(settings.assets.logoOnDarkUrl),
            mark: isOwnAssetUrl(settings.assets.markUrl),
          }}
        />
      ) : (
        <EmptyState
          icon={AlertTriangle}
          title="We couldn't load your branding settings"
          description="Nothing has changed. Reload the page to try again."
        />
      )}
    </PageShell>
  );
}
