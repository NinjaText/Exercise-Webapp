import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssessmentsLoading() {
  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <TableSkeleton rows={6} columns={4} />
    </PageShell>
  );
}
