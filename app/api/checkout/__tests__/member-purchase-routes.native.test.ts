import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/native/server", () => ({ getNativeInfo: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: null })) }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { getNativeInfo } from "@/lib/native/server";
import { stripe } from "@/lib/stripe";
import { POST as memberCheckout } from "../member/route";
import { POST as coachingCheckout } from "../coaching/route";
import { POST as memberPortal } from "../../stripe/member-portal/route";

// Club-member purchase routes: subscription checkout, paid coaching checkout
// and the member billing portal (plan changes are a purchase path too).
const routes = { memberCheckout, coachingCheckout, memberPortal };

describe("club-member purchase routes inside the native shell", () => {
  for (const [name, POST] of Object.entries(routes)) {
    it(`${name} refuses native requests before touching Stripe`, async () => {
      vi.mocked(getNativeInfo).mockResolvedValue({ isNative: true, platform: "ios", appVersion: "1.0.0" });
      const res = await POST();
      expect(res.status).toBe(403);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    });

    it(`${name} proceeds past the guard on the web`, async () => {
      vi.mocked(getNativeInfo).mockResolvedValue({ isNative: false });
      const res = await POST();
      expect(res.status).not.toBe(403);
    });
  }
});
