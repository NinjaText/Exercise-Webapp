import type { LucideIcon } from "lucide-react";
import {
  Apple,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Inbox,
  LayoutDashboard,
  Library,
  Settings,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";

export type Role = "TRAINER" | "CLIENT";

/**
 * Phone support tier from the mobile spec §5a.
 * 1 = phone-first (redesigned), 2 = phone-usable (view & light edit),
 * 3 = desktop-only (read-only view + notice on phones).
 */
export type PhoneTier = 1 | 2 | 3;

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the bottom tab bar; falls back to `label`. */
  tabLabel?: string;
  icon: LucideIcon;
  tier: PhoneTier;
}

export const TRAINER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tier: 1 },
  { href: "/clients", label: "Clients", icon: Users, tier: 1 },
  { href: "/programs", label: "Programs", icon: Library, tier: 2 },
  { href: "/exercises", label: "Exercises", icon: Dumbbell, tier: 2 },
  { href: "/nutrition", label: "Nutrition", icon: Apple, tier: 2 },
  { href: "/messages", label: "Inbox", icon: Inbox, tier: 1 },
  { href: "/analytics", label: "Analytics", icon: TrendingUp, tier: 2 },
];

export const CLIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tier: 1 },
  { href: "/programs", label: "My Programs", tabLabel: "Programs", icon: ClipboardList, tier: 1 },
  // The month calendar moved off the dashboard onto its own page, so it needs
  // a nav entry of its own to stay discoverable.
  { href: "/calendar", label: "Calendar", icon: CalendarDays, tier: 1 },
  { href: "/nutrition", label: "Nutrition", icon: Apple, tier: 1 },
  { href: "/messages", label: "Inbox", icon: Inbox, tier: 1 },
];

// Settings sections (account, notifications, organization, branding,
// billing, audit log) are tabs on the settings page — see
// components/settings/settings-tabs.ts — so the nav only links the page.
export const TRAINER_ACCOUNT_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, tier: 2 },
];

export const CLIENT_ACCOUNT_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, tier: 2 },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Super Admin", icon: Shield, tier: 3 };

const TRAINER_TAB_HREFS = ["/dashboard", "/clients", "/programs", "/messages"];
const CLIENT_TAB_HREFS = ["/dashboard", "/programs", "/calendar", "/nutrition", "/messages"];

/**
 * `hidden` holds hrefs the org's capabilities switch off (see
 * lib/org-capabilities.ts → hiddenNavHrefs). Empty for trainer orgs, so the
 * default call is exactly today's nav.
 */
export function getPrimaryNav(role: Role, hidden: string[] = []): NavItem[] {
  const nav = role === "TRAINER" ? TRAINER_NAV : CLIENT_NAV;
  return hidden.length ? nav.filter((item) => !hidden.includes(item.href)) : nav;
}

export function getAccountNav(role: Role): NavItem[] {
  return role === "TRAINER" ? TRAINER_ACCOUNT_NAV : CLIENT_ACCOUNT_NAV;
}

export interface TabLayout {
  /** Items rendered as bottom tabs, in order. */
  tabs: NavItem[];
  /** Primary items that did not fit; shown in the "More" sheet. Empty → no More tab. */
  more: NavItem[];
}

export function getTabLayout(role: Role, hidden: string[] = []): TabLayout {
  const nav = getPrimaryNav(role, hidden);
  const tabHrefs = role === "TRAINER" ? TRAINER_TAB_HREFS : CLIENT_TAB_HREFS;
  const tabs = tabHrefs
    .map((href) => nav.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const more = nav.filter((item) => !tabHrefs.includes(item.href));
  return { tabs, more };
}

/**
 * The single source for the phone "More" sheet's contents: primary-nav
 * overflow, then account nav, then Super Admin when applicable. Exported so
 * this composition can be unit-tested directly — a closed base-ui `Sheet`
 * renders an empty string under `renderToStaticMarkup`, so the tab bar's own
 * tests cannot see inside it.
 */
export function getMoreItems(role: Role, isAdmin: boolean, hidden: string[] = []): NavItem[] {
  const { more } = getTabLayout(role, hidden);
  return [...more, ...getAccountNav(role), ...(isAdmin ? [ADMIN_NAV] : [])];
}

/**
 * The active link is whichever registered href is the longest prefix of the
 * current pathname — "most specific wins" prevents /settings lighting up on
 * /settings/billing. Prefix matches must end at a path boundary.
 */
export function findActiveHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
}
