"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { useSearch } from "@/components/search/search-provider";
import type { User, Notification } from "@prisma/client";

interface HeaderProps {
  user: User;
  unreadMessageCount: number;
  unreadNotificationCount: number;
  initialNotifications: Notification[];
  unreadVoiceCount?: number;
  trainerClerkId?: string;
}

function getPageTitle(pathname: string): string {
  const exactMap: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/exercises": "Exercise Library",
    "/exercises/new": "New Exercise",
    "/programs": "Programs",
    "/programs/new": "New Program",
    "/programs/generate": "Generate Program",
    "/programs/upload": "Upload Program",
    "/clients": "Clients",
    "/messages": "Inbox",
    "/voice-messages": "Voice Messages",
    "/assessments": "Assessments",
    "/assessments/new": "New Assessment",
    "/check-ins": "Check-ins",
    "/check-ins/new": "New Check-in Template",
    "/habits": "Habits",
    "/settings": "Settings",
    "/settings/billing": "Billing & Subscription",
    "/settings/audit-log": "Audit Log",
    "/settings/clinic": "Organization Settings",
  };

  if (exactMap[pathname]) return exactMap[pathname];

  if (pathname.startsWith("/exercises/") && pathname.endsWith("/edit")) return "Edit Exercise";
  if (pathname.startsWith("/exercises/")) return "Exercise Details";
  if (pathname.startsWith("/programs/") && pathname.endsWith("/edit")) return "Edit Program";
  if (pathname.startsWith("/programs/")) return "Program Details";
  if (pathname.startsWith("/clients/") && pathname.endsWith("/adherence")) return "Sessions";
  if (pathname.startsWith("/clients/") && pathname.endsWith("/outcomes")) return "Outcomes";
  if (pathname.startsWith("/clients/") && pathname.endsWith("/progress")) return "Progress";
  if (pathname.startsWith("/clients/")) return "Client Details";
  if (pathname.startsWith("/messages/")) return "Conversation";
  if (pathname.startsWith("/sessions/")) return "Workout Session";
  if (pathname.startsWith("/check-ins/") && pathname.endsWith("/respond")) return "Complete Check-in";
  if (pathname.startsWith("/check-ins/")) return "Check-in Response";

  return "INMOTUS RX";
}

export function Header({
  user,
  unreadMessageCount,
  unreadNotificationCount,
  initialNotifications,
  unreadVoiceCount = 0,
  trainerClerkId,
}: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const { setOpen: openSearch } = useSearch();

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-6">
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
            unreadVoiceCount={unreadVoiceCount}
            trainerClerkId={trainerClerkId}
          />
        </SheetContent>
      </Sheet>

      {/* Breadcrumb-style page title */}
      <div className="flex items-center gap-2">
        <span className="hidden text-sm font-semibold text-primary sm:inline-block">
          INMOTUS RX
        </span>
        <span className="hidden text-muted-foreground/40 sm:inline-block">/</span>
        <h1 className="text-sm font-semibold sm:text-base">{pageTitle}</h1>
      </div>

      <div className="flex-1" />

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
      <UserButton signInUrl="/sign-in" />

    </header>
  );
}
