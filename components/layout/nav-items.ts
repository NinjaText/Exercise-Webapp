import type { LucideIcon } from "lucide-react";
import {
  Apple,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Dumbbell,
  History,
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

export const TRAINER_ACCOUNT_NAV: NavItem[] = [
  { href: "/settings/billing", label: "Billing", icon: CreditCard, tier: 3 },
  { href: "/settings", label: "Settings", icon: Settings, tier: 2 },
  { href: "/settings/notifications", label: "Notifications", icon: Bell, tier: 2 },
  { href: "/settings/clinic", label: "Organization", icon: Building2, tier: 3 },
  { href: "/settings/audit-log", label: "Audit Log", icon: History, tier: 3 },
];

export const CLIENT_ACCOUNT_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, tier: 2 },
  { href: "/settings/notifications", label: "Notifications", icon: Bell, tier: 2 },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Super Admin", icon: Shield, tier: 3 };

const TRAINER_TAB_HREFS = ["/dashboard", "/clients", "/programs", "/messages"];
const CLIENT_TAB_HREFS = ["/dashboard", "/programs", "/calendar", "/nutrition", "/messages"];

export function getPrimaryNav(role: Role): NavItem[] {
  return role === "TRAINER" ? TRAINER_NAV : CLIENT_NAV;
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

export function getTabLayout(role: Role): TabLayout {
  const nav = getPrimaryNav(role);
  const tabHrefs = role === "TRAINER" ? TRAINER_TAB_HREFS : CLIENT_TAB_HREFS;
  const tabs = tabHrefs
    .map((href) => nav.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const more = nav.filter((item) => !tabHrefs.includes(item.href));
  return { tabs, more };
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
