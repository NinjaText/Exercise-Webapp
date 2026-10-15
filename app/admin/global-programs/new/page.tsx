import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { listClerkOrganizations } from "@/lib/services/admin.service";
import { GlobalProgramEditorWrapper } from "../global-program-editor-wrapper";
import { PageShell } from "@/components/shared/page-shell";
import { BreadcrumbRegistrar } from "@/components/layout/breadcrumb-context";

export default async function NewGlobalProgramPage() {
  await requireSuperAdmin();
  const [exercises, clinics] = await Promise.all([
    getExercises(),
    listClerkOrganizations(),
  ]);

  return (
    <PageShell>
      <BreadcrumbRegistrar
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Global Programs", href: "/admin/global-programs" },
          { label: "New Program" },
        ]}
      />
      <GlobalProgramEditorWrapper
        exercises={exercises}
        clinics={clinics}
        title="New global program"
        backHref="/admin/global-programs"
        notice="Create a master program that will be available to all organizations."
      />
    </PageShell>
  );
}
