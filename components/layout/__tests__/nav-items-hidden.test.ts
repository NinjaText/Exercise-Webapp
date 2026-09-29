import { describe, it, expect } from "vitest";
import { getPrimaryNav, getTabLayout, getMoreItems } from "@/components/layout/nav-items";

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
});
