"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { SIDEBAR_DRAWER_CLASS } from "./sidebar-primitives";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { useSearch } from "@/components/search/search-provider";
import { Breadcrumbs, useBreadcrumb } from "./breadcrumb-context";
import type { User, Notification } from "@prisma/client";
import type { BrandingViewModel } from "@/lib/branding/types";

interface HeaderProps {
  user: User;
  unreadMessageCount: number;
  unreadNotificationCount: number;
  initialNotifications: Notification[];
  /** Client-safe branding subset (never tokens/CSS). */
  branding: BrandingViewModel;
  /** Hrefs the org's capabilities hide (club orgs). */
  hiddenHrefs?: string[];
}

export function Header({
  user,
  unreadMessageCount,
  unreadNotificationCount,
  initialNotifications,
  branding,
  hiddenHrefs = [],
}: HeaderProps) {
  const pathname = usePathname();
  const { crumbs } = useBreadcrumb();
  const { setOpen: openSearch } = useSearch();

  return (
    <header
      className="shrink-0 border-b border-border bg-surface"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 lg:px-6 2xl:px-8">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger
            aria-label="Open navigation"
            className="-ml-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors select-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </SheetTrigger>
          <SheetContent side="left" className={SIDEBAR_DRAWER_CLASS}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar
              role={user.role}
              currentPath={pathname}
              unreadMessageCount={unreadMessageCount}
              userName={`${user.firstName} ${user.lastName}`}
              userEmail={user.email}
              userImageUrl={user.imageUrl}
              mobileMode
              hiddenHrefs={hiddenHrefs}
              branding={branding}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 items-center">
          {crumbs.length > 0 ? (
            <Breadcrumbs crumbs={crumbs} />
          ) : (
            <span className="truncate text-label text-foreground">{branding.displayName}</span>
          )}
        </div>

        {/* Search */}
        <Button
          variant="outline"
          size="sm"
          className="hidden w-56 justify-start gap-2 bg-surface-muted font-normal text-muted-foreground hover:text-foreground sm:flex"
          onClick={() => openSearch(true)}
        >
          <Search className="size-3.5" aria-hidden />
          <span className="flex-1 text-left text-label font-normal">Search...</span>
          <kbd className="pointer-events-none rounded border border-border bg-surface px-1.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </Button>

        {/* Notifications */}
        <NotificationPanel
          initialNotifications={initialNotifications}
          initialUnreadCount={unreadNotificationCount}
        />

        {/* User button (always visible top-right; contains sign out) */}
        <div className="flex size-11 shrink-0 items-center justify-center lg:size-9">
          <UserButton signInUrl="/sign-in" appearance={clerkAppearance} />
        </div>
      </div>
    </header>
  );
}
