import { describe, it, expect } from "vitest";
import { getPrimaryNav, getTabLayout, getMoreItems, getAccountNav } from "@/components/layout/nav-items";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("nav filtering by hidden hrefs", () => {
  it("is unchanged when nothing is hidden", () => {
    expect(getPrimaryNav("CLIENT", [])).toEqual(getPrimaryNav("CLIENT"));
    expect(getTabLayout("CLIENT", [])).toEqual(getTabLayout("CLIENT"));
  });

  it("removes the inbox for a club member everywhere", () => {
    const hidden = ["/messages", "/check-ins"];
    expect(hrefs(getPrimaryNav("CLIENT", hidden))).not.toContain("/messages");
    const { tabs, more } = getTabLayout("CLIENT", hidden);
    expect(hrefs(tabs)).not.toContain("/messages");
    expect(hrefs(more)).not.toContain("/messages");
    expect(hrefs(getMoreItems("CLIENT", false, hidden))).not.toContain("/messages");
  });

  // Billing is a settings tab, not an account nav entry; the club-trainer hiding
  // for that tab is covered in components/settings/__tests__/settings-header.test.tsx.
  it("never puts trainer billing in the account nav or More menu", () => {
    const hidden = ["/settings/billing"];
    expect(hrefs(getAccountNav("TRAINER"))).not.toContain("/settings/billing");
    expect(hrefs(getAccountNav("TRAINER", hidden))).not.toContain("/settings/billing");
    expect(hrefs(getMoreItems("TRAINER", false, hidden))).not.toContain("/settings/billing");
    expect(hrefs(getPrimaryNav("TRAINER", hidden))).toContain("/messages");
  });
});
