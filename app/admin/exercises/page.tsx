import { getAllExercises } from "@/lib/services/admin.service";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Search, UploadCloud, FileSpreadsheet } from "lucide-react";
import { AdminExercisesTable } from "@/components/admin/exercises-table";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{ search?: string; bodyRegion?: string; page?: string }>;
}

export default async function AdminExercisesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const bodyRegion = params.bodyRegion ?? "ALL";
  const page = parseInt(params.page ?? "1", 10);

  const { items: exercises, total, totalPages } = await getAllExercises({ page, pageSize: 25, search, bodyRegion });

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

      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="search" defaultValue={search} placeholder="Search exercises…" className="pl-9" />
        </div>
        <Select name="bodyRegion" defaultValue={bodyRegion}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Body region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All regions</SelectItem>
            <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
            <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
            <SelectItem value="CORE">Core</SelectItem>
            <SelectItem value="FULL_BODY">Full Body</SelectItem>
            <SelectItem value="BALANCE">Balance</SelectItem>
            <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
          </SelectContent>
        </Select>
        <button type="submit" className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-colors">
          Filter
        </button>
      </form>

      <AdminExercisesTable
        exercises={exercises}
        total={total}
        totalPages={totalPages}
        page={page}
        search={search}
        bodyRegion={bodyRegion}
      />
    </div>
  );
}
