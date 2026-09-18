import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { listClerkOrganizations } from "@/lib/services/admin.service";
import { GlobalProgramEditorWrapper } from "../global-program-editor-wrapper";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewGlobalProgramPage() {
  await requireSuperAdmin();
  const [exercises, clinics] = await Promise.all([
    getExercises(),
    listClerkOrganizations(),
  ]);

  return (
    <PageShell>
      <PageHeader
        back={{ label: "Back to Global Programs", href: "/admin/global-programs" }}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Global Programs", href: "/admin/global-programs" },
          { label: "New Program" },
        ]}
        title="New Global Program"
        description="Create a master program that will be available to all organizations."
      />
      <GlobalProgramEditorWrapper exercises={exercises} clinics={clinics} />
    </PageShell>
  );
}
