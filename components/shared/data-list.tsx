import Link from "next/link";
import { Inbox } from "lucide-react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClickableRow } from "@/components/shared/clickable-row";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  align?: "left" | "right";
  render?: (item: T) => React.ReactNode;
  /**
   * Below 640px each row becomes a card: the first column is the card title,
   * a column with an empty header (row actions) sits in its top-right corner,
   * and the rest are labelled fields. "hide" leaves a column out of the card.
   */
  mobile?: "hide";
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
 * The default list surface (spec §2.3). A table with a muted header row,
 * 44px rows (36px compact) with a subtle hover, optional row navigation,
 * right-aligned numerics, sticky header and the shared EmptyState when
 * there is no data. Replaces DataTable.
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
 *
 * Phones get the same markup restyled as stacked cards (`max-sm:` classes
 * below), so there is one DOM for both and no sideways-scrolling table.
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
  // TableCell is 44px tall by default (spec §2.3); compact tightens it to 36px.
  const cellSize = density === "compact" ? "h-9 py-1.5" : undefined;
  // A little more breathing room at the card edges than between columns.
  const edgePad = "sm:first:pl-4 sm:last:pr-4";

  // Phone card layout. The row is a two-column grid of labelled fields
  // (label from data-label), the title spans it, and the action cell is
  // pinned top-right above the stretched row link.
  const cardRow = "max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-4 max-sm:gap-y-2.5 max-sm:px-4 max-sm:py-3.5";
  const cardCell =
    "max-sm:flex max-sm:h-auto max-sm:min-w-0 max-sm:flex-col max-sm:items-start max-sm:gap-0.5 max-sm:p-0 max-sm:text-left max-sm:whitespace-normal max-sm:before:text-caption max-sm:before:font-medium max-sm:before:content-[attr(data-label)]";
  const cardTitle = "max-sm:col-span-2 max-sm:pr-10 max-sm:before:hidden";
  const cardAction = "max-sm:absolute max-sm:top-2.5 max-sm:right-2.5 max-sm:z-10 max-sm:before:hidden";
  // A column the table already hides on narrow screens stays out of the card.
  const hiddenNarrow = (col: Column<T>) => /(^|\s)hidden(\s|$)/.test(col.className ?? "");
  const mobileClass = (col: Column<T>, i: number) =>
    col.mobile === "hide" || hiddenNarrow(col) ? "max-sm:hidden" : i === 0 ? cardTitle : col.header === "" ? cardAction : undefined;

  const cellContent = (item: T, col: Column<T>) =>
    col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? "");

  return (
    <div
      data-slot="data-list"
      data-density={density}
      className={cn("overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border", className)}
    >
      <div
        data-slot="table-container"
        className={cn("relative w-full overflow-x-auto", maxHeight && "overflow-y-auto")}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full caption-bottom text-sm max-sm:block">
          <TableHeader className={cn("max-sm:sr-only", stickyHeader && "sticky top-0 z-10 bg-surface-muted")}>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  edgePad,
                  col.align === "right" && "text-right",
                  col.className
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">
          {data.length === 0 ? (
            <TableRow className="hover:bg-transparent max-sm:block">
              <TableCell colSpan={columns.length} className="p-0 max-sm:block max-sm:whitespace-normal">
                {emptyState ?? <EmptyState icon={Inbox} title={emptyMessage} size="compact" />}
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => {
              const href = rowHref?.(item);
              const cells = columns.map((col, i) => (
                <TableCell
                  key={col.key}
                  data-label={col.header || undefined}
                  className={cn(
                    cellSize,
                    edgePad,
                    col.align === "right" && "text-right tabular-nums",
                    cardCell,
                    col.className,
                    mobileClass(col, i)
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
                  <ClickableRow key={keyExtractor(item)} onActivate={() => onRowClick(item)} className={cardRow}>
                    {cells}
                  </ClickableRow>
                );
              }

              return (
                <TableRow
                  key={keyExtractor(item)}
                  data-clickable={href ? "true" : undefined}
                  className={cn("relative", cardRow, href && "cursor-pointer")}
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
