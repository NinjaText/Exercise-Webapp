import { getAllExercises } from "@/lib/services/admin.service";
import { Button } from "@/components/ui/button";
import { Plus, UploadCloud, FileSpreadsheet } from "lucide-react";
import { AdminExercisesTable } from "@/components/admin/exercises-table";
import { AdminExerciseFilters } from "@/components/admin/admin-exercise-filters";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{ search?: string; bodyRegion?: string; page?: string }>;
}

export default async function AdminExercisesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const bodyRegions = (params.bodyRegion ?? "").split(",").filter(Boolean);
  const page = parseInt(params.page ?? "1", 10);

  const { items: exercises, total, totalPages } = await getAllExercises({ page, pageSize: 25, search, bodyRegions });

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
