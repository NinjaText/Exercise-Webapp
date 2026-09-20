"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";
import { Settings, Activity, Shield, CreditCard, History, Building2, Bell } from "lucide-react";
import { findActiveHref, getAccountNav, getPrimaryNav } from "./nav-items";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SidebarProps {
  role: "TRAINER" | "CLIENT";
  currentPath: string;
  /** Unread chat messages plus unread workout voice notes — one combined badge. */
  unreadMessageCount: number;
  userName: string;
  userEmail: string;
  userImageUrl?: string | null;
  mobileMode?: boolean;
  isAdmin?: boolean;
}

export function Sidebar({
  role,
  unreadMessageCount,
  userName,
  userEmail,
  mobileMode = false,
  isAdmin = false,
}: SidebarProps) {
  const pathname = usePathname();
  const links = getPrimaryNav(role);

  // Collect every href rendered in this sidebar so we can find the best match.
  const allHrefs = [...links.map((l) => l.href), ...getAccountNav(role).map((l) => l.href)];
  const bestMatch = findActiveHref(pathname, allHrefs);

  const navItem = (href: string, label: string, Icon: React.ElementType, badge?: React.ReactNode) => {
    const isActive = href === bestMatch;

    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "group relative flex items-center gap-3 h-9 rounded-lg px-3 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-sidebar-primary/15 text-sidebar-primary shadow-sm"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        )}
      >
        <Icon
          className={cn(
            "size-4 shrink-0",
            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
          )}
        />
        <span className="flex-1">{label}</span>
        {badge}
      </Link>
    );
  };

  return (
    <aside
      className={cn("w-64 flex-col bg-sidebar", mobileMode ? "flex" : "hidden lg:flex")}
      style={{
        background: "linear-gradient(180deg, var(--sidebar), oklch(0.15 0.04 264))",
      }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border/60 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted shadow-sm">
          <Activity className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
            INMOTUS RX
          </span>
          <p className="text-[10px] font-medium text-sidebar-foreground/40 uppercase tracking-widest">
            {role === "TRAINER" ? "Trainer Portal" : "Client Portal"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="min-h-0 flex-1 px-3 py-5">
        <div className="mb-1 px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
            Navigation
          </p>
        </div>
        <nav className="space-y-0.5">
          {links.map((link) => {
            const badge =
              link.href === "/messages" && unreadMessageCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="h-5 min-w-5 justify-center px-1 text-[10px] font-bold"
                >
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </Badge>
              ) : undefined;

            return navItem(link.href, link.label, link.icon, badge);
          })}
        </nav>

        <div className="my-5 h-px bg-sidebar-border/40" />

        <div className="mb-1 px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
            Account
          </p>
        </div>
        {role === "TRAINER" && navItem("/settings/billing", "Billing", CreditCard)}
        {navItem("/settings", "Settings", Settings)}
        {pathname.startsWith("/settings") && !pathname.startsWith("/settings/billing") && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border/50 pl-2">
            {navItem("/settings/notifications", "Notifications", Bell)}
            {role === "TRAINER" && navItem("/settings/clinic", "Organization", Building2)}
            {role === "TRAINER" && navItem("/settings/audit-log", "Audit Log", History)}
          </div>
        )}

        {isAdmin && (
          <>
            <div className="my-5 h-px bg-sidebar-border/40" />
            <div className="mb-1 px-3 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
                Admin
              </p>
            </div>
            <Link
              href="/admin"
              className="group flex items-center gap-3 h-9 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-all duration-150"
            >
              <Shield className="size-4 shrink-0 text-sidebar-primary/70" />
              <span className="flex-1">Super Admin</span>
              <span className="rounded-full bg-sidebar-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sidebar-primary">
                Admin
              </span>
            </Link>
          </>
        )}
      </ScrollArea>

      {/* User section */}
      <div className="border-t border-sidebar-border/60 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/40 px-3 py-2.5">
          <UserButton signInUrl="/sign-in" appearance={clerkAppearance} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground leading-tight">
              {userName}
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/40 leading-tight">
              {userEmail}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
