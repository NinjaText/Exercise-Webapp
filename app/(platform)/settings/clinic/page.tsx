import { requireRole } from "@/lib/current-user";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { OrganizationProfileForm } from "@/components/settings/organization-profile-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { ArrowLeft, Palette } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function OrganizationSettingsPage() {
  await requireRole("TRAINER");
  const profile = await getOrganizationProfile();

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
          title="Organization Profile"
          description="Your organization's profile and contact details"
          secondaryActions={
            <Button variant="outline" asChild>
              <Link href="/settings/branding">
                <Palette className="mr-1 h-4 w-4" />
                Branding
              </Link>
            </Button>
          }
          className="pb-0"
        />
      </div>
      <OrganizationProfileForm initialData={profile ?? undefined} />
    </PageShell>
  );
}
