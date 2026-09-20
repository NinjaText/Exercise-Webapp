import { describe, it, expect } from "vitest";
import {
  ADMIN_NAV,
  findActiveHref,
  getAccountNav,
  getMoreItems,
  getPrimaryNav,
  getTabLayout,
  type Role,
} from "../nav-items";

describe("getTabLayout", () => {
  it("gives clients five tabs and nothing under More", () => {
    const { tabs, more } = getTabLayout("CLIENT");
    expect(tabs.map((t) => t.href)).toEqual(["/dashboard", "/programs", "/calendar", "/nutrition", "/messages"]);
    expect(more).toEqual([]);
  });

  it("gives trainers four tabs plus the rest under More", () => {
    const { tabs, more } = getTabLayout("TRAINER");
    expect(tabs.map((t) => t.href)).toEqual(["/dashboard", "/clients", "/programs", "/messages"]);
    expect(more.map((m) => m.href)).toEqual(["/exercises", "/nutrition", "/analytics"]);
  });

  it("uses tabLabel when the sidebar label is too long", () => {
    const programs = getTabLayout("CLIENT").tabs.find((t) => t.href === "/programs");
    expect(programs?.label).toBe("My Programs");
    expect(programs?.tabLabel).toBe("Programs");
  });

  it("assigns a phone tier to every item", () => {
    for (const item of [...getPrimaryNav("TRAINER"), ...getPrimaryNav("CLIENT"), ...getAccountNav("TRAINER")]) {
      expect([1, 2, 3]).toContain(item.tier);
    }
  });
});

describe("getMoreItems", () => {
  const roles: Role[] = ["TRAINER", "CLIENT"];

  it("includes every overflow and account-nav href, for both roles, when not admin", () => {
    for (const role of roles) {
      const hrefs = getMoreItems(role, false).map((i) => i.href);
      for (const item of getTabLayout(role).more) {
        expect(hrefs).toContain(item.href);
      }
      for (const item of getAccountNav(role)) {
        expect(hrefs).toContain(item.href);
      }
      expect(hrefs).not.toContain(ADMIN_NAV.href);
    }
  });

  it("appends Super Admin as the last entry when isAdmin is true, for both roles", () => {
    for (const role of roles) {
      const items = getMoreItems(role, true);
      const hrefs = items.map((i) => i.href);
      expect(hrefs).toContain(ADMIN_NAV.href);
      expect(items[items.length - 1]?.href).toBe(ADMIN_NAV.href);
    }
  });

  it("excludes trainer-only account nav for clients", () => {
    const clientHrefs = getMoreItems("CLIENT", false).map((i) => i.href);
    for (const href of ["/settings/billing", "/settings/clinic", "/settings/audit-log"]) {
      expect(clientHrefs).not.toContain(href);
    }
  });

  it("never duplicates a tab href, for either role, admin or not", () => {
    for (const role of roles) {
      const tabHrefs = getTabLayout(role).tabs.map((t) => t.href);
      for (const isAdmin of [false, true]) {
        const moreHrefs = getMoreItems(role, isAdmin).map((i) => i.href);
        for (const tabHref of tabHrefs) {
          expect(moreHrefs).not.toContain(tabHref);
        }
      }
    }
  });
});

describe("findActiveHref", () => {
  const hrefs = ["/settings", "/settings/billing", "/clients", "/dashboard"];

  it("matches an exact path", () => {
    expect(findActiveHref("/clients", hrefs)).toBe("/clients");
  });

  it("matches the longest prefix for nested paths", () => {
    expect(findActiveHref("/settings/billing/history", hrefs)).toBe("/settings/billing");
    expect(findActiveHref("/settings/clinic", hrefs)).toBe("/settings");
  });

  it("does not match a sibling that merely shares a prefix string", () => {
    expect(findActiveHref("/clientsarchive", hrefs)).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(findActiveHref("/nowhere", hrefs)).toBeUndefined();
  });
});
