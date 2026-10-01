import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    trainerSubscription: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
  },
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import { POST as checkout } from "../checkout/route";
import { POST as portal } from "../portal/route";

const trainer = { id: "t1", role: "TRAINER", clerkOrgId: "org_1" };
const caps = (orgType: "TRAINER" | "CLUB") => getUserCapabilities({ orgType, role: "TRAINER", coachingActive: false });
const checkoutReq = () => new Request("http://x/api/stripe/checkout", { method: "POST", body: JSON.stringify({ tier: "PRO" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any);
  vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ stripeCustomerId: "cus_1", status: "TRIALING" } as any);
  vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: "https://stripe.test/c" } as any);
  vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({ url: "https://stripe.test/p" } as any);
});

describe("POST /api/stripe/checkout", () => {
  it("403 for a club trainer (trainerBilling off) without touching Stripe", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("CLUB"));
    const res = await checkout(checkoutReq());
    expect(res.status).toBe(403);
    expect(getCapabilitiesForUser).toHaveBeenCalledWith(trainer);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a session for a trainer-org trainer (regression)", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("TRAINER"));
    const res = await checkout(checkoutReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://stripe.test/c" });
  });
});

describe("POST /api/stripe/portal", () => {
  it("403 for a club trainer (trainerBilling off) without touching Stripe", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("CLUB"));
    const res = await portal();
    expect(res.status).toBe(403);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("opens the portal for a trainer-org trainer (regression)", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(caps("TRAINER"));
    const res = await portal();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://stripe.test/p" });
  });
});
