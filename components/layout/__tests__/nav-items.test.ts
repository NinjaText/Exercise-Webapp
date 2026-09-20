import { describe, it, expect } from "vitest";
import { findActiveHref, getAccountNav, getPrimaryNav, getTabLayout } from "../nav-items";

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
