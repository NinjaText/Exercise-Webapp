import Link from "next/link";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClickableRow } from "@/components/shared/clickable-row";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  align?: "left" | "right";
  render?: (item: T) => React.ReactNode;
}

export interface DataListProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  /** Makes each row navigate. Wins over onRowClick. */
  rowHref?: (item: T) => string;
  onRowClick?: (item: T) => void;
  density?: "default" | "compact";
  stickyHeader?: boolean;
  /** CSS length (e.g. "70vh"). Makes the list its own vertical scroll container. */
  maxHeight?: string;
  /** Rendered in place of the table body when data is empty. */
  emptyState?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

/**
 * The default list surface (spec §5). A table with hover rows, optional
 * row navigation, right-aligned numerics, sticky header and a built-in
 * empty state. Replaces DataTable.
 *
 * Server-compatible. `rowHref` rows are plain anchors; `onRowClick` rows
 * render the client `ClickableRow`, so `onRowClick` is only usable from
 * client components.
 *
 * When rowHref is set, the first cell's link is stretched over the whole
 * row (`after:absolute after:inset-0`), which requires the row to be
 * `relative` (it is, by default). Any other interactive element rendered
 * inside such a row (e.g. a row action menu button) must add
 * `relative z-10` so it stays clickable above the stretched link.
 *
 * When onRowClick is set without rowHref, the row is made keyboard
 * accessible: it is focusable (`tabIndex={0}`) and Enter or Space
 * activates onRowClick, same as a click.
 *
 * `stickyHeader` only has an effect together with `maxHeight`, which makes
 * the list its own vertical scroll container.
 */
export function DataList<T>({
  columns,
  data,
  keyExtractor,
  rowHref,
  onRowClick,
  density = "default",
  stickyHeader = false,
  maxHeight,
  emptyState,
  emptyMessage = "No data found",
  className,
}: DataListProps<T>) {
  const cellPad = density === "compact" ? "py-2" : "py-3";

  const cellContent = (item: T, col: Column<T>) =>
    col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? "");

  return (
    <div
      data-slot="data-list"
      data-density={density}
      className={cn("rounded-xl bg-card ring-1 ring-border overflow-hidden", className)}
    >
      <div
        data-slot="table-container"
        className={cn("relative w-full overflow-x-auto", maxHeight && "overflow-y-auto")}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full caption-bottom text-sm">
          <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-card")}>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                  col.align === "right" && "text-right",
                  col.className
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                {emptyState ?? (
                  <div className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
                )}
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => {
              const href = rowHref?.(item);
              const cells = columns.map((col, i) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    cellPad,
                    col.align === "right" && "text-right tabular-nums",
                    col.className
                  )}
                >
                  {i === 0 && href ? (
                    // The first cell's link is stretched over the row so the
                    // whole row navigates while remaining a real anchor.
                    <Link href={href} className="after:absolute after:inset-0 after:content-['']">
                      {cellContent(item, col)}
                    </Link>
                  ) : (
                    cellContent(item, col)
                  )}
                </TableCell>
              ));

              if (!href && onRowClick) {
                return (
                  <ClickableRow key={keyExtractor(item)} onActivate={() => onRowClick(item)}>
                    {cells}
                  </ClickableRow>
                );
              }

              return (
                <TableRow
                  key={keyExtractor(item)}
                  data-clickable={href ? "true" : undefined}
                  className={cn("relative", href && "cursor-pointer")}
                >
                  {cells}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </table>
      </div>
    </div>
  );
}
