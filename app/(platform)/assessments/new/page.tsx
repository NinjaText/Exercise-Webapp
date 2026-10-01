import { getCurrentUser } from "@/lib/current-user";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { NewAssessmentForm } from "@/components/outcomes/new-assessment-form";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewAssessmentPage() {
  const user = await getCurrentUser();

  let clients: { id: string; firstName: string; lastName: string }[] = [];
  if (user.role === "TRAINER") {
    clients = await getClientsForTrainer(user.id);
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Record assessment"
        description={
          user.role === "CLIENT"
            ? "Track your own measurements and outcomes."
            : "Record a clinical measurement for one of your clients."
        }
        back={{ label: "Back to assessments", href: "/assessments" }}
        breadcrumb={[{ label: "Assessments", href: "/assessments" }, { label: "New" }]}
      />
      <NewAssessmentForm
        role={user.role}
        selfClientId={user.role === "CLIENT" ? user.id : undefined}
        clients={clients}
      />
    </PageShell>
  );
}
