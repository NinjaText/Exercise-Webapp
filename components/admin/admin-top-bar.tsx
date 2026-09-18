"use client";

import { Breadcrumbs, useBreadcrumb } from "@/components/layout/breadcrumb-context";

/**
 * Middle slot of the admin top bar: renders the page's breadcrumb trail
 * (pushed via BreadcrumbRegistrar) or falls back to the brand text when a
 * page hasn't registered any crumbs. Mirrors components/layout/header.tsx.
 */
export function AdminTopBar() {
  const { crumbs } = useBreadcrumb();

  return (
    <div className="flex min-w-0 flex-1 items-center">
      {crumbs.length > 0 ? (
        <Breadcrumbs crumbs={crumbs} />
      ) : (
        <span className="text-sm font-semibold tracking-tight">INMOTUS RX</span>
      )}
    </div>
  );
}
