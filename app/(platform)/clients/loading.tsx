import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the clients page: header + line tabs, search toolbar, then the DataList. */
export default function ClientsLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="flex gap-5 border-b border-border pb-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <Skeleton className="h-9 w-full max-w-sm" />
      <TableSkeleton rows={6} columns={4} />
    </PageShell>
  );
}
