import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/shared/page-shell";
import { MESSAGES_PANE_SURFACE, MESSAGES_VIEWPORT_HEIGHT } from "@/components/messages/layout-classes";
import { cn } from "@/lib/utils";

export default function MessagesLoading() {
  return (
    <PageShell width="full" className={MESSAGES_VIEWPORT_HEIGHT}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className={cn("grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_1fr] lg:grid-cols-[20rem_1fr]", MESSAGES_PANE_SURFACE)}>
        <div className="flex flex-col border-r border-border">
          <div className="border-b border-border p-3">
            <Skeleton className="h-9 w-full" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden flex-col md:flex">
          <div className="flex h-14 items-center gap-3 border-b border-border px-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                <Skeleton className="h-12 w-56 rounded-2xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
