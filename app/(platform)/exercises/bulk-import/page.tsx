import { getCurrentUser, isSuperAdmin } from "@/lib/current-user";
import { BulkImportForm } from "@/components/exercises/bulk-import-form";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";

export default async function BulkImportPage() {
  const user = await getCurrentUser();
  const admin = await isSuperAdmin();
  if (user.role !== "TRAINER" && !admin) redirect("/dashboard");

  return (
    <PageShell width="narrow">
      <PageHeader
        back={{ label: "Back to exercises", href: "/exercises" }}
        breadcrumb={[{ label: "Exercises", href: "/exercises" }, { label: "Bulk import" }]}
        title="Bulk Import Exercises"
        description="Upload multiple exercise videos at once, then use AI to generate metadata for each one."
      />
      <BulkImportForm />
    </PageShell>
  );
}
