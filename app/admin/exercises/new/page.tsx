import { requireSuperAdmin } from "@/lib/current-user";
import { ExerciseForm } from "@/components/exercises/exercise-form";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function AdminNewExercisePage() {
  await requireSuperAdmin();

  return (
    <PageShell width="narrow">
      <PageHeader
        back={{ label: "Back to Exercises", href: "/admin/exercises" }}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Exercise Library", href: "/admin/exercises" },
          { label: "Add Exercise" },
        ]}
        title="Add Exercise"
        description="Add a new exercise to the platform library. All trainers can use it in programs."
      />
      <ExerciseForm />
    </PageShell>
  );
}
