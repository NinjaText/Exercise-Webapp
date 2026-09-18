import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getProgramById } from "@/lib/services/program.service";
import { AdminProgramEditorWrapper } from "../admin-program-editor-wrapper";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

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
      <PageHeader
        back={{ label: "Back to Program", href: `/admin/programs/${id}` }}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Programs", href: "/admin/programs" },
          { label: program.name as string, href: `/admin/programs/${id}` },
          { label: "Edit" },
        ]}
        title="Edit Program"
        description="Editing on behalf of the program's trainer. Changes apply immediately."
      />
      <AdminProgramEditorWrapper
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
      />
    </PageShell>
  );
}
