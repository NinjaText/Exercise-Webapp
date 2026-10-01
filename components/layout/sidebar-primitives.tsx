import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Shared building blocks for the platform and Super Admin sidebars (spec
 * §2.2), so both shells use one row, group-label, badge and user-block style.
 *
 * The sidebar is the always-dark `--sidebar` surface. Text uses
 * `sidebar-foreground` at ≥60% so it stays above 4.5:1 on it, and the accent
 * colour is `sidebar-primary`, which the branding token derivation keeps at
 * 4.5:1 on the (branded) sidebar (lib/branding/tokens.ts).
 */

/** Shell width and surface, shared by both sidebars. `mobileMode` = inside the drawer. */
export function sidebarAsideClass(mobileMode: boolean) {
  return cn(
    "w-64 shrink-0 flex-col bg-sidebar-gradient text-sidebar-foreground",
    // The drawer variant needs an explicit full height or the column collapses.
    mobileMode ? "flex h-full" : "hidden border-r border-sidebar-border/60 lg:flex",
  );
}

/** Drawer (Sheet) classes so the left drawer matches the sidebar surface and width. */
export const SIDEBAR_DRAWER_CLASS =
  "gap-0 border-sidebar-border bg-sidebar p-0 data-[side=left]:w-64 data-[side=left]:max-w-[85vw] [&_[data-slot=sheet-close]]:text-sidebar-foreground/70 [&_[data-slot=sheet-close]]:hover:bg-sidebar-accent [&_[data-slot=sheet-close]]:hover:text-sidebar-foreground";

/** The top identity row (org lockup / Super Admin lockup). 56px, aligned with the top bar. */
export function SidebarIdentityRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border/60 px-4 in-data-[slot=sheet-content]:pr-14">
      {children}
    </div>
  );
}

export function SidebarGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="px-2.5 pb-1 text-caption font-medium tracking-wider text-sidebar-foreground/60 uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

interface SidebarNavLinkProps {
  href: string;
  label: string;
  icon: React.ElementType;
  active?: boolean;
  /** Trailing slot: an unread count or a small tag. */
  badge?: React.ReactNode;
}

/** A 32px nav row. Active = filled pill + an accent marker on the left edge. */
export function SidebarNavLink({ href, label, icon: Icon, active = false, badge }: SidebarNavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-label outline-none transition-colors motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-sidebar-primary",
        active
          ? "bg-sidebar-accent text-sidebar-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground/80",
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}

/** Unread count pill for a nav row (capped at 99+). Renders nothing at 0. */
export function SidebarCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge
      variant="destructive"
      className="h-5 min-w-5 px-1.5 text-caption font-semibold tabular-nums"
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

/** Small uppercase tag for a nav row (e.g. "Admin"). */
export function SidebarTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-sidebar-primary/20 px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-wide text-sidebar-primary uppercase">
      {children}
    </span>
  );
}

/** The account block pinned to the bottom of the sidebar. `menu` is the account menu trigger. */
export function SidebarUserBlock({
  menu,
  name,
  email,
  footer,
}: {
  menu: React.ReactNode;
  name: string;
  email: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="shrink-0 border-t border-sidebar-border/60 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        {menu}
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-sidebar-foreground">{name}</p>
          <p className="truncate text-caption text-sidebar-foreground/60">{email}</p>
        </div>
      </div>
      {footer}
    </div>
  );
}
