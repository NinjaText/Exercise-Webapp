"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { useSearch } from "@/components/search/search-provider";
import { Breadcrumbs, useBreadcrumb } from "./breadcrumb-context";
import type { User, Notification } from "@prisma/client";

interface HeaderProps {
  user: User;
  unreadMessageCount: number;
  unreadNotificationCount: number;
  initialNotifications: Notification[];
}

export function Header({
  user,
  unreadMessageCount,
  unreadNotificationCount,
  initialNotifications,
}: HeaderProps) {
  const pathname = usePathname();
  const { crumbs } = useBreadcrumb();
  const { setOpen: openSearch } = useSearch();

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-4 sm:px-6">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium transition-all outline-none select-none hover:bg-muted hover:text-foreground size-8 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            role={user.role}
            currentPath={pathname}
            unreadMessageCount={unreadMessageCount}
            userName={`${user.firstName} ${user.lastName}`}
            userEmail={user.email}
            userImageUrl={user.imageUrl}
            mobileMode
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 items-center">
        {crumbs.length > 0 ? (
          <Breadcrumbs crumbs={crumbs} />
        ) : (
          <span className="text-sm font-semibold tracking-tight">INMOTUS RX</span>
        )}
      </div>

      {/* Search */}
      <Button
        variant="outline"
        size="sm"
        className="hidden gap-2 text-muted-foreground sm:flex"
        onClick={() => openSearch(true)}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs">Search...</span>
        <kbd className="pointer-events-none ml-2 hidden rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </Button>

      {/* Notifications */}
      <NotificationPanel
        initialNotifications={initialNotifications}
        initialUnreadCount={unreadNotificationCount}
      />

      {/* User button (always visible top-right; contains sign out) */}
      <UserButton signInUrl="/sign-in" appearance={clerkAppearance} />

    </header>
  );
}
