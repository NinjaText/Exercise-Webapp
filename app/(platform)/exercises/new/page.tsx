import { requireSuperAdmin } from "@/lib/current-user";
import { ExerciseForm } from "@/components/exercises/exercise-form";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewExercisePage() {
  await requireSuperAdmin();

  return (
    <PageShell width="narrow">
      <PageHeader
        back={{ label: "Back to Exercises", href: "/exercises" }}
        breadcrumb={[{ label: "Exercises", href: "/exercises" }, { label: "New Exercise" }]}
        title="New Exercise"
      />
      <ExerciseForm />
    </PageShell>
  );
}
