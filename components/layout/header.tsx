"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";
import { profileAppearanceFor } from "@/lib/native/auth-appearance";
import { useNative } from "@/hooks/use-native";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./sidebar";
import { MobileNavDrawer } from "./mobile-nav-drawer";
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
  const { isNative } = useNative();
  const { crumbs } = useBreadcrumb();
  const { setOpen: openSearch } = useSearch();

  return (
    <header
      className="shrink-0 border-b border-border bg-surface"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 lg:px-6 2xl:px-8">
        {/* Mobile menu */}
        <MobileNavDrawer>
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
        </MobileNavDrawer>

        <div className="flex min-w-0 flex-1 items-center">
          {crumbs.length > 0 ? (
            <Breadcrumbs crumbs={crumbs} />
          ) : (
            <span className="truncate text-label text-foreground">{branding.displayName}</span>
          )}
        </div>

        {/* Search: an icon on phones (the palette's shortcuts need a keyboard),
            the wide trigger from sm up. Both open the same palette. */}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground sm:hidden"
          aria-label="Search"
          onClick={() => openSearch(true)}
        >
          <Search className="size-4.5" aria-hidden />
        </Button>
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
          <UserButton
            signInUrl="/sign-in"
            appearance={clerkAppearance}
            userProfileProps={{ appearance: profileAppearanceFor(isNative) }}
          />
        </div>
      </div>
    </header>
  );
}
