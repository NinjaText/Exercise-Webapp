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
}

const tabClass =
  "flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors";

/**
 * Primary navigation for phones (spec §5). Visible below the `lg` breakpoint
 * on both mobile web and the native shell. The header's menu button keeps
 * secondary navigation (Settings, Organization, Billing, Admin).
 */
export function MobileTabBar({ role, unreadMessageCount, isAdmin = false }: MobileTabBarProps) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);

  const { tabs, more } = getTabLayout(role);
  const moreItems: NavItem[] = getMoreItems(role, isAdmin);
  const hasMore = more.length > 0;

  const active = findActiveHref(pathname, [...tabs, ...moreItems].map((i) => i.href));
  const moreIsActive = hasMore && moreItems.some((item) => item.href === active);
  const columns = tabs.length + (hasMore ? 1 : 0);

  const inboxBadge = (href: string) =>
    href === "/messages" && unreadMessageCount > 0 ? (
      <Badge
        variant="destructive"
        className="absolute right-1/2 top-1 h-4 min-w-4 translate-x-4 justify-center px-1 text-[10px] font-bold"
      >
        {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
      </Badge>
    ) : null;

  return (
    <>
      <nav
        data-slot="mobile-tab-bar"
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
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
                  className={cn(tabClass, isActive ? "text-primary" : "text-muted-foreground")}
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
                className={cn(tabClass, moreIsActive ? "text-primary" : "text-muted-foreground")}
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
            <SheetTitle className="px-4 pt-4 text-sm font-semibold text-muted-foreground">More</SheetTitle>
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
                        "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-xs font-medium",
                        item.href === active ? "border-primary/40 text-primary" : "text-foreground"
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
