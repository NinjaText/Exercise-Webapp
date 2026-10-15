import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getProgramById } from "@/lib/services/program.service";
import { notFound } from "next/navigation";
import { GlobalProgramEditorWrapper } from "../../global-program-editor-wrapper";
import { PageShell } from "@/components/shared/page-shell";
import { BreadcrumbRegistrar } from "@/components/layout/breadcrumb-context";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditGlobalProgramPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const [program, exercises] = await Promise.all([
    getProgramById(id),
    getExercises(),
  ]);

  if (!program || !program.isGlobal) notFound();

  return (
    <PageShell>
      <BreadcrumbRegistrar
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Global Programs", href: "/admin/global-programs" },
          { label: "Edit" },
        ]}
      />
      <GlobalProgramEditorWrapper
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
        title="Edit global program"
        backHref="/admin/global-programs"
        notice="Changes will be reflected for all organizations after pushing an update."
      />
    </PageShell>
  );
}
