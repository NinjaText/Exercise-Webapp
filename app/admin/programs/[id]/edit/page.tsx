import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getProgramById } from "@/lib/services/program.service";
import { AdminProgramEditorWrapper } from "../admin-program-editor-wrapper";
import { PageShell } from "@/components/shared/page-shell";
import { BreadcrumbRegistrar } from "@/components/layout/breadcrumb-context";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminProgramEditPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const [program, exercises] = await Promise.all([
    getProgramById(id),
    getExercises(),
  ]);

  if (!program || program.isGlobal) notFound();

  return (
    <PageShell>
      <BreadcrumbRegistrar
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Programs", href: "/admin/programs" },
          { label: program.name as string, href: `/admin/programs/${id}` },
          { label: "Edit" },
        ]}
      />
      <AdminProgramEditorWrapper
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
        title="Edit program"
        backHref={`/admin/programs/${id}`}
        notice="Editing on behalf of the program's trainer. Changes apply immediately."
      />
    </PageShell>
  );
}
