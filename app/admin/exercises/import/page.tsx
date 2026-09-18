import { requireSuperAdmin } from "@/lib/current-user";
import { CsvImportForm } from "@/components/exercises/csv-import-form";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

export default async function AdminCsvImportPage() {
  await requireSuperAdmin();

  return (
    <PageShell width="narrow">
      <PageHeader
        back={{ label: "Back to Exercises", href: "/admin/exercises" }}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Exercise Library", href: "/admin/exercises" },
          { label: "Import from CSV" },
        ]}
        title="Import Exercises from CSV"
        description="Bulk-add exercises to the platform library. Download the template, fill it in with AI, add YouTube URLs, then upload."
      />
      <CsvImportForm />
    </PageShell>
  );
}
