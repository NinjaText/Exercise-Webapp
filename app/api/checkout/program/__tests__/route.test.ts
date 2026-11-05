import { describe, it, expect, vi, beforeEach } from "vitest";

const getPkg = vi.fn();
const createSession = vi.fn();
const findUser = vi.fn();
const checkLimit = vi.fn();

vi.mock("@/lib/services/sellable-package.service", () => ({ getSellablePackageBySlug: (s: string) => getPkg(s) }));
vi.mock("@/lib/payments/program-checkout", () => ({ createProgramCheckoutSession: (a: unknown) => createSession(a) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (a: unknown) => findUser(a) } } }));
vi.mock("@/lib/billing/client-limit", () => ({ checkClientLimit: (...a: unknown[]) => checkLimit(...a) }));

import { POST } from "../route";

const req = () => new Request("http://x/api/checkout/program", { method: "POST", body: JSON.stringify({ slug: "p1" }) });

describe("POST /api/checkout/program — seller client cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPkg.mockResolvedValue({ id: "pk1", slug: "p1", name: "P", priceInCents: 1000, currency: "usd", programTemplateId: "t1", trainerId: "tr1", upsell: null });
    findUser.mockResolvedValue({ id: "tr1", role: "TRAINER", clerkOrgId: "org1", email: "t@x.com" });
    createSession.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
  });

  it("refuses with 409 before creating a Stripe session when the seller is at their cap", async () => {
    checkLimit.mockResolvedValue({ ok: false });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("client_limit");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("starts checkout when the seller has room", async () => {
    checkLimit.mockResolvedValue({ ok: true });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledOnce();
  });

  it("never blocks a sale when the limit lookup fails", async () => {
    checkLimit.mockRejectedValue(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});
