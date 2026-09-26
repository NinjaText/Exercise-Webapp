import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/native/server", () => ({ getNativeInfo: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: vi.fn() } } },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, trainerSubscription: { findUnique: vi.fn() } },
}));

import { getNativeInfo } from "@/lib/native/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { POST } from "../route";

const req = () => new Request("https://app.test/api/stripe/checkout", { method: "POST", body: JSON.stringify({ tier: "PRO" }) });

describe("POST /api/stripe/checkout", () => {
  it("refuses requests from the native shell before touching Stripe", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: true, platform: "ios", appVersion: "1.0.0" });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("proceeds past the guard on the web", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: false });
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    const res = await POST(req());
    expect(res.status).toBe(401);
  });
});
