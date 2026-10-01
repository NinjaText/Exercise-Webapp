import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
  itemLabel?: string;
}

/** Builds a compact page list: first, last, current±1, with "…" gaps elided. */
function buildPageList(page: number, totalPages: number): (number | "...")[] {
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | "...")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("...");
    result.push(sorted[i]);
  }
  return result;
}

// Spec §2.3: sm-size (32px) hairline controls with the token focus ring.
const navButton =
  "flex h-8 items-center justify-center rounded-md border border-border bg-surface transition-colors outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

export function PaginationBar({ page, pageSize, total, buildHref, itemLabel = "items" }: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = buildPageList(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row"
    >
      <p className="text-body text-muted-foreground tabular-nums">
        Showing {start} to {end} of {total} {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={buildHref(Math.max(1, page - 1))}
          aria-disabled={page === 1}
          aria-label="Previous page"
          className={cn(
            navButton,
            "w-8 text-muted-foreground hover:text-foreground",
            page === 1 && "pointer-events-none opacity-40"
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={buildHref(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                navButton,
                "min-w-8 px-2 text-label tabular-nums",
                p === page
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-border text-foreground hover:bg-surface-muted"
              )}
            >
              {p}
            </Link>
          )
        )}
        <Link
          href={buildHref(Math.min(totalPages, page + 1))}
          aria-disabled={page === totalPages}
          aria-label="Next page"
          className={cn(
            navButton,
            "w-8 text-muted-foreground hover:text-foreground",
            page === totalPages && "pointer-events-none opacity-40"
          )}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
