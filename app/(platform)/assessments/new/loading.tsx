import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssessmentNewLoading() {
  return (
    <PageShell width="narrow">
      <div>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-4 h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <CardSkeleton />
    </PageShell>
  );
}
