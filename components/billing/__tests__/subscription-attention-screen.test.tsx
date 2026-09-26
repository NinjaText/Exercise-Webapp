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
});
