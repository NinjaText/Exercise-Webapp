import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getExerciseById } from "@/lib/services/exercise.service";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { ExerciseEditForm } from "@/components/exercises/exercise-edit-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditExercisePage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();

  const { isSuperAdmin } = await import("@/lib/current-user");
  if (!(await isSuperAdmin())) redirect("/exercises");

  const exercise = await getExerciseById(id);
  if (!exercise) notFound();

  return (
    <PageShell width="narrow">
      <PageHeader
        back={{ label: "Back to Exercise", href: `/exercises/${id}` }}
        breadcrumb={[
          { label: "Exercises", href: "/exercises" },
          { label: exercise.name, href: `/exercises/${id}` },
          { label: "Edit" },
        ]}
        title={`Edit: ${exercise.name}`}
      />
      <ExerciseEditForm exercise={exercise} />
    </PageShell>
  );
}
