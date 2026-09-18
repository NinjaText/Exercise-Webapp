import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getProgramById } from "@/lib/services/program.service";
import { notFound } from "next/navigation";
import { GlobalProgramEditorWrapper } from "../../global-program-editor-wrapper";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

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
      <PageHeader
        back={{ label: "Back to Global Programs", href: "/admin/global-programs" }}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Global Programs", href: "/admin/global-programs" },
          { label: "Edit" },
        ]}
        title="Edit Global Program"
        description="Changes will be reflected for all organizations after pushing an update."
      />
      <GlobalProgramEditorWrapper
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
      />
    </PageShell>
  );
}
