import { requireSuperAdmin } from "@/lib/current-user";
import { listClerkOrganizations } from "@/lib/services/admin.service";
import { GlobalGenerateWrapper } from "./global-generate-wrapper";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function AdminGenerateGlobalProgramPage() {
  await requireSuperAdmin();
  const clinics = await listClerkOrganizations();

  return (
    <PageShell>
      <PageHeader
        back={{ label: "Back to Global Programs", href: "/admin/global-programs" }}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Global Programs", href: "/admin/global-programs" },
          { label: "Generate with AI" },
        ]}
        title="Generate Global Program"
        description="Use AI to create a master program that will be available to all organizations."
      />
      <GlobalGenerateWrapper clinics={clinics} />
    </PageShell>
  );
}
