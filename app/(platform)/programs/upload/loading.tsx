import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageShell } from "@/components/shared/page-shell";

export default function ProgramBriefUploadLoading() {
  return (
    <PageShell>
      <div>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-4 h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      {/* The tool itself is desktop-only: phones get a plain placeholder until
          the desktop-only notice streams in, not a builder-shaped skeleton. */}
      <Skeleton className="h-40 rounded-xl sm:hidden" />
      <div className="hidden flex-col gap-6 sm:flex">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
