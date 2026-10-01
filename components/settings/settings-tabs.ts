import type { Role } from "@/components/layout/nav-items";

export interface SettingsTab {
  href: string;
  label: string;
  roles: readonly Role[];
}

/**
 * Every settings section, in tab order. Each tab is its own route under
 * /settings so deep links (emails, billing redirects) keep working; the
 * shared header in app/(platform)/settings/layout.tsx renders them as tabs.
 */
export const SETTINGS_TABS: readonly SettingsTab[] = [
  { href: "/settings", label: "Account", roles: ["TRAINER", "CLIENT"] },
  { href: "/settings/notifications", label: "Notifications", roles: ["TRAINER", "CLIENT"] },
  { href: "/settings/clinic", label: "Organization", roles: ["TRAINER"] },
  { href: "/settings/branding", label: "Branding", roles: ["TRAINER"] },
  { href: "/settings/billing", label: "Billing", roles: ["TRAINER"] },
  { href: "/settings/audit-log", label: "Audit log", roles: ["TRAINER"] },
];

/** `hidden` drops tabs the org turns off (lib/org-capabilities.ts → hiddenNavHrefs). */
export function getSettingsTabs(role: Role, hidden: readonly string[] = []): SettingsTab[] {
  return SETTINGS_TABS.filter((tab) => tab.roles.includes(role) && !hidden.includes(tab.href));
}
