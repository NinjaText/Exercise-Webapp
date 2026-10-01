import { Skeleton } from "@/components/ui/skeleton";

// Only the tab body loads; the settings header and tabs come from the layout.
export default function SettingsLoading() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="flex flex-col gap-4 rounded-xl p-6 ring-1 ring-border">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
