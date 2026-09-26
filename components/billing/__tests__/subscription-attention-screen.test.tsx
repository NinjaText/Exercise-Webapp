import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs", () => ({ SignOutButton: ({ children }: { children: React.ReactNode }) => children }));

import { SubscriptionAttentionScreen } from "../subscription-attention-screen";

describe("SubscriptionAttentionScreen", () => {
  for (const reason of ["trial_expired", "payment_failed", "manage"] as const) {
    it(`${reason}: neutral copy, no price, no payment link, offers sign out`, () => {
      const html = renderToStaticMarkup(<SubscriptionAttentionScreen reason={reason} />);
      expect(html).toContain("managed from your account on the web");
      expect(html).not.toMatch(/\$\d/);
      expect(html.toLowerCase()).not.toContain("stripe");
      expect(html).not.toContain("http");
      expect(html).not.toMatch(/<a\b/);
      expect(html).toContain("Sign out");
    });
  }

  it("uses an <h1> for the page layout, and an <h2> (no <h1>) for the inline layout so the host page's own <h1> stays unique", () => {
    const pageHtml = renderToStaticMarkup(<SubscriptionAttentionScreen reason="manage" layout="page" />);
    expect(pageHtml).toContain("<h1");

    const inlineHtml = renderToStaticMarkup(<SubscriptionAttentionScreen reason="manage" layout="inline" />);
    expect(inlineHtml).toContain("<h2");
    expect(inlineHtml).not.toContain("<h1");
  });
});
