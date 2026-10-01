import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { PageShell } from "@/components/shared/page-shell";

export default function DashboardLoading() {
  return (
    <PageShell>
      <DashboardSkeleton />
    </PageShell>
  );
}
