import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/current-user";
import { getExerciseById } from "@/lib/services/exercise.service";
import { ExerciseEditForm } from "@/components/exercises/exercise-edit-form";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminEditExercisePage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const exercise = await getExerciseById(id);
  if (!exercise) notFound();

  return (
    <PageShell width="narrow">
      <PageHeader
        back={{ label: "Back to Exercises", href: "/admin/exercises" }}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Exercise Library", href: "/admin/exercises" },
          { label: "Edit Exercise" },
        ]}
        title="Edit Exercise"
        description="Update the exercise details, video, and media for the platform library."
      />
      <ExerciseEditForm exercise={exercise} />
    </PageShell>
  );
}
