import { cn } from "@/lib/utils";

interface PageToolbarProps {
  /** Left group: search, filters, view toggle, sort. */
  children?: React.ReactNode;
  /** Right-aligned group. */
  end?: React.ReactNode;
  className?: string;
}

/**
 * One row; controls bring their own height (Button size / Input). Filters,
 * search, sort and view toggles live here and nowhere else (spec §4.3).
 * Wraps on small screens.
 */
export function PageToolbar({ children, end, className }: PageToolbarProps) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn("flex min-h-9 flex-wrap items-start gap-2", className)}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {end && <div className="flex shrink-0 items-center gap-2">{end}</div>}
    </div>
  );
}
