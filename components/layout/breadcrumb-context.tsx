"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

type Ctx = { crumbs: Crumb[]; setCrumbs: (crumbs: Crumb[]) => void };

const BreadcrumbContext = React.createContext<Ctx | null>(null);

// Outside the platform shell (marketing, onboarding) there is no header to
// feed. Hoisted to module scope so useBreadcrumb returns a stable reference.
const NOOP_CTX: Ctx = { crumbs: [], setCrumbs: () => {} };

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = React.useState<Crumb[]>([]);
  const value = React.useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumb(): Ctx {
  const ctx = React.useContext(BreadcrumbContext);
  if (!ctx) return NOOP_CTX;
  return ctx;
}

/**
 * Rendered by PageHeader (a server component) to push its crumbs into the
 * client-side header. Registers on mount, clears on unmount so a page that
 * has no PageHeader shows nothing stale.
 */
export function BreadcrumbRegistrar({ crumbs }: { crumbs: Crumb[] }) {
  const { setCrumbs } = useBreadcrumb();
  const key = JSON.stringify(crumbs);
  React.useEffect(() => {
    setCrumbs(crumbs);
    return () => setCrumbs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCrumbs]);
  return null;
}

export function Breadcrumbs({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-1.5 text-sm", className)}>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        // Phones keep only the parent and the current page; the parent gives
        // up width first so the current page title stays readable.
        const phoneHidden = i < crumbs.length - 2 && "max-sm:hidden";
        const phoneParent = !last && "max-sm:max-w-[40%] max-sm:shrink-0";
        return (
          <React.Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && (
              <ChevronRight
                data-slot="crumb-separator"
                aria-hidden
                className={cn("size-3.5 shrink-0 text-muted-foreground/50", i <= crumbs.length - 2 && "max-sm:hidden")}
              />
            )}
            {last || !crumb.href ? (
              <span
                aria-current={last ? "page" : undefined}
                className={cn("truncate", last ? "font-semibold text-foreground" : "text-muted-foreground", phoneHidden, phoneParent)}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className={cn("truncate text-muted-foreground transition-colors hover:text-foreground", phoneHidden, phoneParent)}
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
