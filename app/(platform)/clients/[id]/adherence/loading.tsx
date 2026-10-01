import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";

export default function AdherenceLoading() {
  return (
    <PageShell>
      <DashboardSkeleton />
    </PageShell>
  );
}
