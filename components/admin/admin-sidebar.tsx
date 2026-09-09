"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Dumbbell,
  Library,
  Shield,
  ExternalLink,
  Globe,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const adminLinks = [
  { href: "/admin",                  label: "Overview",        icon: LayoutDashboard, exact: true },
  { href: "/admin/users",            label: "Users",           icon: Users },
  { href: "/admin/analytics",        label: "Analytics",       icon: BarChart3 },
  { href: "/admin/exercises",        label: "Exercises",       icon: Dumbbell },
  { href: "/admin/programs",         label: "All Programs",    icon: Library },
  { href: "/admin/global-programs",  label: "Global Programs", icon: Globe },
  { href: "/admin/audit-log",        label: "Audit Log",       icon: ScrollText },
];

interface AdminSidebarProps {
  userName: string;
  userEmail: string;
  userImageUrl?: string | null;
  mobileMode?: boolean;
}

export function AdminSidebar({ userName, userEmail, mobileMode = false }: AdminSidebarProps) {
  const pathname = usePathname();

  const navItem = (href: string, label: string, Icon: React.ElementType, exact = false) => {
    const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-sidebar-primary/15 text-sidebar-primary shadow-sm"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        )}
      >
        <Icon
          className={cn(
            "h-4.5 w-4.5 shrink-0 transition-transform duration-150 group-hover:scale-105",
            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
          )}
        />
        <span className="flex-1">{label}</span>
      </Link>
    );
  };

  return (
    <aside className={cn("w-64 flex-col bg-sidebar", mobileMode ? "flex" : "hidden lg:flex")}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border/60 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted shadow-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">INMOTUS RX</span>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-primary/70">
            Super Admin
          </p>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-5">
        <div className="mb-1 px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
            Administration
          </p>
        </div>
        <nav className="space-y-0.5">
          {adminLinks.map((link) => navItem(link.href, link.label, link.icon, link.exact))}
        </nav>

        <div className="my-5 h-px bg-sidebar-border/40" />

        <div className="mb-1 px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
            Platform
          </p>
        </div>
        <Link
          href="/dashboard"
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-all duration-150"
        >
          <ExternalLink className="h-4.5 w-4.5 shrink-0 text-sidebar-foreground/50 group-hover:scale-105 transition-transform duration-150" />
          <span>Go to Platform</span>
        </Link>
      </ScrollArea>

      {/* User section */}
      <div className="border-t border-sidebar-border/60 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/40 px-3 py-2.5">
          <UserButton signInUrl="/sign-in" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground leading-tight">{userName}</p>
            <p className="truncate text-[11px] text-sidebar-foreground/40 leading-tight">{userEmail}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
