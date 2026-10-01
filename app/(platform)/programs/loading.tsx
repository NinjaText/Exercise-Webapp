import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the trainer programs page: header + line tabs, filter toolbar, then the table. */
export default function ProgramsLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="flex gap-5 border-b border-border pb-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 max-w-sm flex-1" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-24" />
        </div>
        <TableSkeleton rows={6} columns={5} />
      </div>
    </PageShell>
  );
}
