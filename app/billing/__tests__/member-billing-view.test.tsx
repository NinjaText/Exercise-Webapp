import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/stripe", () => ({
  stripe: { prices: { retrieve: vi.fn(async () => ({ unit_amount: 2900, currency: "usd", recurring: { interval: "month" } })) } },
}));
vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(async () => ({ enabled: true, displayName: "Pine Valley", logoOnLightUrl: null, logoOnDarkUrl: null, markUrl: null })),
}));
vi.mock("@/components/branding/brand-style", () => ({ BrandStyle: () => null }));
vi.mock("@/lib/clubs/coaching-view", () => ({
  getCoachingViewModel: vi.fn(async () => ({ status: "ACTIVE", priceLabel: "$99 / month" })),
}));
vi.mock("../member-billing-buttons", () => ({
  MemberBillingButtons: (p: { canSubscribe: boolean }) => (p.canSubscribe ? "SUBSCRIBE_BTN" : "NO_SUBSCRIBE"),
}));

import { MemberBillingView } from "../member-billing-view";

const org = { clerkOrgId: "org_club", stripePriceId: "price_1" } as any;

describe("MemberBillingView", () => {
  it("renders the club membership as a premium plan card with status banners", async () => {
    const trialEnds = new Date(Date.now() + 5 * 86_400_000);
    const html = renderToStaticMarkup(
      await MemberBillingView({
        org,
        sub: { status: "TRIALING", trialEndsAt: trialEnds, stripeCustomerId: null } as any,
        reason: "payment_failed",
        userId: "u1",
      }),
    );
    expect(html).toContain("Pine Valley membership");
    expect(html).toContain("$29");
    expect(html).toContain("Billed monthly");
    expect(html).toContain("bg-danger-soft");
    expect(html).toContain("bg-info-soft");
    expect(html).toContain("SUBSCRIBE_BTN");
    // Coaching section on the member view
    expect(html).toContain("Coaching");
    expect(html).toContain("$99 / month");
  });
});
