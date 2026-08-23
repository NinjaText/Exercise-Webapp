"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Dumbbell,
  ClipboardList,
  Users,
  MessageSquare,
  Settings,
  Activity,
  Library,
  ClipboardCheck,
  Flame,
  TrendingUp,
  Shield,
  CreditCard,
  History,
  Apple,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VoiceMessagesNavBadge } from "@/components/voice-memo/VoiceMessagesNavBadge";

interface SidebarProps {
  role: "TRAINER" | "CLIENT";
  currentPath: string;
  unreadMessageCount: number;
  userName: string;
  userEmail: string;
  userImageUrl?: string | null;
  mobileMode?: boolean;
  isAdmin?: boolean;
  unreadVoiceCount?: number;
  trainerClerkId?: string;
}

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
}

const trainerLinks: NavLink[] = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/clients",    label: "Clients",      icon: Users },
  { href: "/programs",    label: "Programs",     icon: Library },
  { href: "/exercises",   label: "Exercises",    icon: Dumbbell },
  { href: "/nutrition",   label: "Nutrition",    icon: Apple },
  // { href: "/check-ins",   label: "Check-ins",    icon: ClipboardCheck },
  // { href: "/habits",      label: "Habits",       icon: Flame },
  { href: "/messages",    label: "Messages",     icon: MessageSquare },
  // { href: "/assessments", label: "Assessments",  icon: BarChart3 },
  { href: "/analytics",   label: "Analytics",    icon: TrendingUp },
];

const clientLinks: NavLink[] = [
  { href: "/dashboard",   label: "Dashboard",    icon: LayoutDashboard },
  { href: "/programs",    label: "My Programs",  icon: ClipboardList },
  { href: "/nutrition",   label: "Nutrition",    icon: Apple },
  // { href: "/habits",      label: "Habits",       icon: Flame },
  // { href: "/check-ins",   label: "Check-ins",    icon: ClipboardCheck },
  // { href: "/assessments", label: "Assessments",  icon: TrendingUp },
  { href: "/messages",    label: "Messages",     icon: MessageSquare },
];

export function Sidebar({
  role,
  unreadMessageCount,
  userName,
  userEmail,
  mobileMode = false,
  isAdmin = false,
  unreadVoiceCount = 0,
  trainerClerkId,
}: SidebarProps) {
  const pathname = usePathname();
  const links = role === "TRAINER" ? trainerLinks : clientLinks;

  // Collect every href rendered in this sidebar so we can find the best match.
  const accountHrefs = [
    "/settings",
    ...(role === "TRAINER" ? ["/settings/clinic", "/settings/billing", "/settings/audit-log"] : []),
  ];
  const allHrefs = [...links.map((l) => l.href), ...accountHrefs];

  // The active link is whichever registered href is the longest prefix of the
  // current pathname — "most specific wins" prevents /settings lighting up on
  // /settings/billing.
  const bestMatch = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const navItem = (href: string, label: string, Icon: React.ElementType, badge?: React.ReactNode) => {
    const isActive = href === bestMatch;

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
      <ScrollArea className="flex-1 px-3 py-5">
        <div className="mb-1 px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
            Navigation
          </p>
        </div>
        <nav className="space-y-0.5">
          {links.map((link) => {
            let badge: React.ReactNode = undefined;
            if (link.href === "/messages") {
              const showUnreadCount = unreadMessageCount > 0;
              const showVoiceBadge = role === "TRAINER" && !!trainerClerkId;
              if (showUnreadCount || showVoiceBadge) {
                badge = (
                  <span className="flex items-center gap-1">
                    {showUnreadCount && (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 justify-center px-1 text-[10px] font-bold"
                      >
                        {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                      </Badge>
                    )}
                    {showVoiceBadge && (
                      <VoiceMessagesNavBadge
                        initialUnread={unreadVoiceCount}
                        trainerClerkId={trainerClerkId!}
                      />
                    )}
                  </span>
                );
              }
            }

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
        {role === "TRAINER" && navItem("/settings/clinic", "Organization Settings", Building2)}
        {role === "TRAINER" && navItem("/settings/audit-log", "Audit Log", History)}

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
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-all duration-150"
            >
              <Shield className="h-4.5 w-4.5 shrink-0 text-sidebar-primary/70 group-hover:scale-105 transition-transform duration-150" />
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
          <UserButton signInUrl="/sign-in" />
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
