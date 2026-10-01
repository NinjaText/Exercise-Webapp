"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";
import { Settings, Shield } from "lucide-react";
import { findActiveHref, getAccountNav, getPrimaryNav } from "./nav-items";
import {
  SidebarCountBadge,
  SidebarGroup,
  SidebarIdentityRow,
  SidebarNavLink,
  SidebarTag,
  SidebarUserBlock,
  sidebarAsideClass,
} from "./sidebar-primitives";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OrgIdentity } from "@/components/branding/org-identity";
import type { BrandingViewModel } from "@/lib/branding/types";

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
  /** Hrefs the org's capabilities hide (club orgs). */
  hiddenHrefs?: string[];
  /** Client-safe branding subset (never tokens/CSS). */
  branding: BrandingViewModel;
}

export function Sidebar({
  role,
  unreadMessageCount,
  userName,
  userEmail,
  mobileMode = false,
  isAdmin = false,
  hiddenHrefs = [],
  branding,
}: SidebarProps) {
  const pathname = usePathname();
  const links = getPrimaryNav(role, hiddenHrefs);

  // Collect every href rendered in this sidebar so we can find the best match.
  const allHrefs = [...links.map((l) => l.href), ...getAccountNav(role, hiddenHrefs).map((l) => l.href)];
  const bestMatch = findActiveHref(pathname, allHrefs);

  const navItem = (href: string, label: string, Icon: React.ElementType, badge?: React.ReactNode) => (
    <SidebarNavLink
      key={href}
      href={href}
      label={label}
      icon={Icon}
      active={href === bestMatch}
      badge={badge}
    />
  );

  return (
    <aside className={sidebarAsideClass(mobileMode)}>
      <SidebarIdentityRow>
        <OrgIdentity
          branding={branding}
          surface="dark"
          subtitle={role === "TRAINER" ? "Trainer Portal" : "Client Portal"}
        />
      </SidebarIdentityRow>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-3 py-4">
          <SidebarGroup label="Navigation">
            <nav aria-label="Main" className="space-y-0.5">
              {links.map((link) =>
                navItem(
                  link.href,
                  link.label,
                  link.icon,
                  link.href === "/messages" ? <SidebarCountBadge count={unreadMessageCount} /> : undefined
                )
              )}
            </nav>
          </SidebarGroup>

          <SidebarGroup label="Account">
            <nav aria-label="Account" className="space-y-0.5">
              {/* Every settings section is a tab on the settings page, so one entry here. */}
              {navItem("/settings", "Settings", Settings)}
            </nav>
          </SidebarGroup>

          {isAdmin && (
            <SidebarGroup label="Admin">
              {navItem("/admin", "Super Admin", Shield, <SidebarTag>Admin</SidebarTag>)}
            </SidebarGroup>
          )}
        </div>
      </ScrollArea>

      <SidebarUserBlock
        menu={<UserButton signInUrl="/sign-in" appearance={clerkAppearance} />}
        name={userName}
        email={userEmail}
        footer={
          // Spec §12.3 default: clients of a branded org see a small product credit.
          branding.enabled && role === "CLIENT" ? (
            <p className="mt-1 text-center text-[10px] text-sidebar-foreground/60">
              Powered by INMOTUS RX
            </p>
          ) : undefined
        }
      />
    </aside>
  );
}
