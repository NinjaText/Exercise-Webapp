"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { findActiveHref, type Role } from "@/components/layout/nav-items";
import { getSettingsTabs } from "@/components/settings/settings-tabs";

/**
 * The one header for every settings tab. Lives in the settings layout, so it
 * stays put while the tab content below it changes; it's a client component
 * because the active tab (and breadcrumb) follow the pathname.
 */
export function SettingsHeader({ role, hiddenHrefs = [] }: { role: Role; hiddenHrefs?: string[] }) {
  const pathname = usePathname();
  const tabs = getSettingsTabs(role, hiddenHrefs);
  const activeHref = findActiveHref(pathname, tabs.map((t) => t.href));
  const active = tabs.find((t) => t.href === activeHref);

  return (
    <PageHeader
      title="Settings"
      description={
        role === "TRAINER"
          ? "Manage your account, organization and subscription."
          : "Manage your account and notifications."
      }
      breadcrumb={[{ label: "Settings", href: "/settings" }, ...(active ? [{ label: active.label }] : [])]}
      tabs={
        <nav
          aria-label="Settings sections"
          // Scrolls sideways on phones instead of wrapping; the scrollbar is
          // hidden because the clipped last tab already signals there's more.
          className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => {
            const isActive = tab.href === activeHref;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      }
    />
  );
}
