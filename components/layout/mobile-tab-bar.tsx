"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  findActiveHref,
  getMoreItems,
  getTabLayout,
  type NavItem,
  type Role,
} from "./nav-items";

interface MobileTabBarProps {
  role: Role;
  /** Unread chat messages plus unread workout voice notes — one combined badge. */
  unreadMessageCount: number;
  isAdmin?: boolean;
  /** Hrefs the org's capabilities hide (club orgs). */
  hiddenHrefs?: string[];
}

// Full-height cells (56px tab bar) clear the 44px mobile target. The active tab
// gets the primary colour plus a short marker on the top edge.
const tabClass =
  "relative flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] leading-none font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:bg-surface-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const activeMarker =
  "before:absolute before:left-1/2 before:top-0 before:h-0.5 before:w-8 before:-translate-x-1/2 before:rounded-b-full before:bg-primary";

/**
 * Primary navigation for phones (spec §5). Visible below the `lg` breakpoint
 * on both mobile web and the native shell. The header's menu button keeps
 * secondary navigation (Settings, Organization, Billing, Admin).
 */
export function MobileTabBar({
  role,
  unreadMessageCount,
  isAdmin = false,
  hiddenHrefs = [],
}: MobileTabBarProps) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);

  const { tabs, more } = getTabLayout(role, hiddenHrefs);
  const moreItems: NavItem[] = getMoreItems(role, isAdmin, hiddenHrefs);
  const hasMore = more.length > 0;

  const active = findActiveHref(pathname, [...tabs, ...moreItems].map((i) => i.href));
  const moreIsActive = hasMore && moreItems.some((item) => item.href === active);
  const columns = tabs.length + (hasMore ? 1 : 0);

  const inboxBadge = (href: string) =>
    href === "/messages" && unreadMessageCount > 0 ? (
      <Badge
        variant="destructive"
        className="absolute top-1 right-1/2 h-4 min-w-4 translate-x-4 px-1 text-[10px] font-semibold tabular-nums"
      >
        {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
      </Badge>
    ) : null;

  return (
    <>
      <nav
        data-slot="mobile-tab-bar"
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <ul
          className="grid h-[var(--tab-bar-height)]"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.href === active;
            return (
              <li key={tab.href} className="relative">
                <Link
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(tabClass, isActive ? cn("text-primary", activeMarker) : "text-muted-foreground hover:text-foreground")}
                >
                  <Icon className="size-5" aria-hidden />
                  <span>{tab.tabLabel ?? tab.label}</span>
                  {inboxBadge(tab.href)}
                </Link>
              </li>
            );
          })}
          {hasMore && (
            <li className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                className={cn(tabClass, moreIsActive ? cn("text-primary", activeMarker) : "text-muted-foreground hover:text-foreground")}
              >
                <MoreHorizontal className="size-5" aria-hidden />
                <span>More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {hasMore && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem_+_var(--safe-bottom))]">
            <SheetTitle className="px-4 pt-4 text-label text-muted-foreground">More</SheetTitle>
            <ul className="grid grid-cols-3 gap-2 px-4">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={item.href === active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-center text-xs font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring",
                        item.href === active
                          ? "border-primary/40 bg-primary/5 text-primary"
                          : "border-border bg-surface text-foreground hover:bg-surface-muted"
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
