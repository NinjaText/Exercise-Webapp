import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExerciseNewLoading() {
  return (
    <PageShell width="narrow">
      <Skeleton className="h-7 w-48" />
      <CardSkeleton />
      <CardSkeleton />
    </PageShell>
  );
}
