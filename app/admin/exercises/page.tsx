import { getAllExercises } from "@/lib/services/admin.service";
import { Button } from "@/components/ui/button";
import { Plus, UploadCloud, FileSpreadsheet } from "lucide-react";
import { AdminExercisesTable } from "@/components/admin/exercises-table";
import { AdminExerciseFilters } from "@/components/admin/admin-exercise-filters";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
    pageSize: 25,
    search,
    bodyRegions,
    isAssessment: activeKind === "assessment",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exercise Library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{total.toLocaleString()} exercises across the platform.</p>
        </div>
        <div className="flex gap-2 shrink-0">
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
          <Button asChild>
            <Link href="/admin/exercises/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Exercise
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
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
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeKind === k
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {k === "training" ? "Training" : "Assessment"}
            </Link>
          );
        })}
      </div>

      <AdminExerciseFilters search={search} selected={bodyRegions} />

      <AdminExercisesTable
        exercises={exercises}
        total={total}
        totalPages={totalPages}
        page={page}
        search={search}
        bodyRegions={bodyRegions}
      />
    </div>
  );
}
