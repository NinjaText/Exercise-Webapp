import { requireRole } from "@/lib/current-user";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { OrganizationProfileForm } from "@/components/settings/organization-profile-form";

export default async function OrganizationSettingsPage() {
  await requireRole("TRAINER");
  const profile = await getOrganizationProfile();

  return (
    <OrganizationProfileForm initialData={profile ?? undefined} />
  );
}
