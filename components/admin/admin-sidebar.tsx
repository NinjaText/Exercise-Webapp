"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Dumbbell,
  Library,
  Shield,
  ArrowLeft,
  Globe,
  ScrollText,
  Flag,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarCountBadge,
  SidebarIdentityRow,
  SidebarNavLink,
  SidebarUserBlock,
  sidebarAsideClass,
} from "@/components/layout/sidebar-primitives";

const adminLinks = [
  { href: "/admin",                  label: "Overview",        icon: LayoutDashboard, exact: true },
  { href: "/admin/users",            label: "Users",           icon: Users },
  { href: "/admin/analytics",        label: "Analytics",       icon: BarChart3 },
  { href: "/admin/exercises",        label: "Exercises",       icon: Dumbbell },
  { href: "/admin/programs",         label: "All Programs",    icon: Library },
  { href: "/admin/global-programs",  label: "Global Programs", icon: Globe },
  { href: "/admin/clubs",            label: "Clubs",           icon: Flag },
  { href: "/admin/audit-log",        label: "Audit Log",       icon: ScrollText },
];

interface AdminSidebarProps {
  userName: string;
  userEmail: string;
  /** Club items waiting on house coaches; hidden at 0. */
  clubAttention?: number;
  mobileMode?: boolean;
}

export function AdminSidebar({ userName, userEmail, clubAttention = 0, mobileMode = false }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={sidebarAsideClass(mobileMode)}>
      {/* Distinct Super Admin identity (never org-branded). */}
      <SidebarIdentityRow>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20">
          <Shield className="size-4 text-sidebar-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <span className="block text-[15px] font-bold tracking-tight text-sidebar-foreground">INMOTUS RX</span>
          <p className="text-[10px] font-semibold tracking-widest text-sidebar-primary uppercase">Super Admin</p>
        </div>
      </SidebarIdentityRow>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-3 py-4">
          <SidebarGroup label="Administration">
            <nav aria-label="Administration" className="space-y-0.5">
              {adminLinks.map((link) => (
                <SidebarNavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  icon={link.icon}
                  active={isActive(link.href, link.exact)}
                  badge={link.href === "/admin/clubs" ? <SidebarCountBadge count={clubAttention} /> : undefined}
                />
              ))}
            </nav>
          </SidebarGroup>

          <SidebarGroup label="Platform">
            <SidebarNavLink href="/dashboard" label="Back to app" icon={ArrowLeft} />
          </SidebarGroup>
        </div>
      </ScrollArea>

      <SidebarUserBlock menu={<UserButton signInUrl="/sign-in" />} name={userName} email={userEmail} />
    </aside>
  );
}
