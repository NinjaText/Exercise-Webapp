import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/shared/page-shell";
import { MESSAGES_PANE_SURFACE, MESSAGES_VIEWPORT_HEIGHT } from "@/components/messages/layout-classes";
import { cn } from "@/lib/utils";

export default function ThreadLoading() {
  return (
    <PageShell className={MESSAGES_VIEWPORT_HEIGHT}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", MESSAGES_PANE_SURFACE)}>
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex flex-1 flex-col gap-4 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
              <Skeleton className="h-12 w-56 rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
