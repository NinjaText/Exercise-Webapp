import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageShell } from "@/components/shared/page-shell";

export default function EditProgramLoading() {
  return (
    <PageShell>
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-60 mt-2" />
      </div>
      {/* The tool itself is desktop-only: phones get a plain placeholder until
          the desktop-only notice streams in, not a builder-shaped skeleton. */}
      <Skeleton className="h-40 rounded-xl sm:hidden" />
      <div className="hidden flex-col gap-6 sm:flex">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 sm:col-span-2" />
            <Skeleton className="h-20 sm:col-span-2" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-60" />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
