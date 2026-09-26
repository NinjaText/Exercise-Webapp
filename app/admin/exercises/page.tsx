import { getAllExercises } from "@/lib/services/admin.service";
import { Button } from "@/components/ui/button";
import { Plus, UploadCloud, FileSpreadsheet } from "lucide-react";
import { AdminExercisesGrid } from "@/components/admin/exercises-grid";
import { AdminExerciseFilters } from "@/components/admin/admin-exercise-filters";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { PageToolbar } from "@/components/shared/page-toolbar";

interface PageProps {
  searchParams: Promise<{ search?: string; bodyRegion?: string; page?: string; kind?: string }>;
}

export default async function AdminExercisesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const bodyRegions = (params.bodyRegion ?? "").split(",").filter(Boolean);
  const page = parseInt(params.page ?? "1", 10);
  const activeKind = params.kind === "assessment" ? "assessment" : "training";

  const { items: exercises, total, totalPages } = await getAllExercises({
    page,
    pageSize: 24,
    search,
    bodyRegions,
    isAssessment: activeKind === "assessment",
  });

  const kindTabs = (
    <div className="flex gap-1">
      {(["training", "assessment"] as const).map((k) => {
        const sp = new URLSearchParams();
        if (search) sp.set("search", search);
        if (bodyRegions.length) sp.set("bodyRegion", bodyRegions.join(","));
        if (k === "assessment") sp.set("kind", "assessment");
        const href = sp.toString() ? `/admin/exercises?${sp.toString()}` : "/admin/exercises";
        return (
          <Link
            key={k}
            href={href}
            className={cn(
              "relative px-3 py-2 text-sm font-medium",
              activeKind === k
                ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {k === "training" ? "Training" : "Assessment"}
          </Link>
        );
      })}
    </div>
  );

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Exercise Library" }]}
        title="Exercise Library"
        description={`${total.toLocaleString()} exercises across the platform.`}
        primaryAction={
          <Button asChild>
            <Link href="/admin/exercises/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Exercise
            </Link>
          </Button>
        }
        secondaryActions={
          <>
            <Button asChild variant="outline">
              <Link href="/exercises/bulk-import">
                <UploadCloud className="mr-2 h-4 w-4" />
                Bulk Import
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/exercises/import">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Import CSV
              </Link>
            </Button>
          </>
        }
        tabs={kindTabs}
      />

      <PageToolbar>
        <AdminExerciseFilters search={search} selected={bodyRegions} />
      </PageToolbar>

      <AdminExercisesGrid
        exercises={exercises}
        total={total}
        totalPages={totalPages}
        page={page}
        search={search}
        bodyRegions={bodyRegions}
        kind={activeKind}
      />
    </PageShell>
  );
}
