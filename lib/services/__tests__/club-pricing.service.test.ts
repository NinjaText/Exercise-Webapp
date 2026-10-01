import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({
  stripe: {
    prices: { retrieve: vi.fn(), create: vi.fn(), update: vi.fn() },
    products: { create: vi.fn(), update: vi.fn() },
  },
}));

import { stripe } from "@/lib/stripe";
import {
  ensureClubPrice,
  disableClubPrice,
  rollbackClubPrices,
  renameClubProducts,
  describeClubPrice,
} from "../club-pricing.service";

const missing = Object.assign(new Error("No such price"), { code: "resource_missing" });
const outage = Object.assign(new Error("connection error"), { type: "StripeConnectionError" });

const price = (over: Record<string, unknown> = {}) => ({
  id: "price_old",
  active: true,
  unit_amount: 1499,
  currency: "usd",
  recurring: { interval: "month", interval_count: 1 },
  product: { id: "prod_old", active: true, metadata: {} },
  ...over,
});

const args = {
  clerkOrgId: "org_1",
  clubName: "Pine Valley",
  kind: "membership" as const,
  amountCents: 1499,
  currentPriceId: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(stripe.products.create).mockResolvedValue({ id: "prod_new" } as any);
  vi.mocked(stripe.prices.create).mockResolvedValue({ id: "price_new", active: true } as any);
  vi.mocked(stripe.prices.update).mockResolvedValue({} as any);
  vi.mocked(stripe.products.update).mockResolvedValue({} as any);
});

describe("ensureClubPrice", () => {
  it("is a no-op when the current price already matches", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue(price() as any);
    const r = await ensureClubPrice({ ...args, currentPriceId: "price_old" });
    expect(r).toMatchObject({ priceId: "price_old", created: false, previousPriceId: null });
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(stripe.products.create).not.toHaveBeenCalled();
  });

  it.each([
    ["the amount changed", {}, 2000],
    ["the price is archived", { active: false }, 1499],
    ["the currency is not usd", { currency: "eur" }, 1499],
    ["the interval is yearly", { recurring: { interval: "year", interval_count: 1 } }, 1499],
  ])("creates a new price on the same product when %s", async (_l, over, amountCents) => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue(price(over) as any);
    const r = await ensureClubPrice({ ...args, amountCents, currentPriceId: "price_old" });
    expect(r).toEqual({
      priceId: "price_new", created: true, previousPriceId: "price_old", productId: "prod_old", productCreated: false,
    });
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).toHaveBeenCalledWith(
      {
        unit_amount: amountCents,
        currency: "usd",
        recurring: { interval: "month" },
        product: "prod_old",
        metadata: { clerkOrgId: "org_1", kind: "membership" },
      },
      { idempotencyKey: expect.any(String) }
    );
    // Archiving the old price is the caller's job, after its DB write.
    expect(stripe.prices.update).not.toHaveBeenCalled();
  });

  it("creates a product and price when there is no current price", async () => {
    const r = await ensureClubPrice({ ...args, kind: "coaching", amountCents: 3000 });
    expect(stripe.products.create).toHaveBeenCalledWith(
      { name: "Pine Valley — Coaching", metadata: { clerkOrgId: "org_1", kind: "coaching", app: "club" } },
      { idempotencyKey: expect.any(String) }
    );
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: 3000, product: "prod_new", metadata: { clerkOrgId: "org_1", kind: "coaching" } }),
      expect.anything()
    );
    expect(r).toEqual({ priceId: "price_new", created: true, previousPriceId: null, productId: "prod_new", productCreated: true });
  });

  it("uses a fresh server-side idempotency key on every call (never a client id)", async () => {
    await ensureClubPrice(args);
    await ensureClubPrice(args);
    const keys = vi.mocked(stripe.prices.create).mock.calls.map((c) => (c[1] as any).idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toMatch(/^club:org_1:membership:/);
  });

  it("re-checks an idempotent replay and creates again with a fresh key when it's archived", async () => {
    vi.mocked(stripe.prices.create)
      .mockResolvedValueOnce({ id: "price_replayed", active: true, lastResponse: { headers: { "idempotent-replayed": "true" } } } as any)
      .mockResolvedValueOnce({ id: "price_fresh", active: true } as any);
    vi.mocked(stripe.prices.retrieve).mockResolvedValue({ id: "price_replayed", active: false } as any);
    const r = await ensureClubPrice(args);
    expect(stripe.prices.retrieve).toHaveBeenCalledWith("price_replayed");
    expect(r.priceId).toBe("price_fresh");
    const keys = vi.mocked(stripe.prices.create).mock.calls.map((c) => (c[1] as any).idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("keeps a replayed price that is still active", async () => {
    vi.mocked(stripe.prices.create).mockResolvedValueOnce({
      id: "price_replayed", active: true, lastResponse: { headers: { "idempotent-replayed": "true" } },
    } as any);
    vi.mocked(stripe.prices.retrieve).mockResolvedValue({ id: "price_replayed", active: true } as any);
    expect((await ensureClubPrice(args)).priceId).toBe("price_replayed");
    expect(stripe.prices.create).toHaveBeenCalledTimes(1);
  });

  it("creates again when the create response itself is inactive", async () => {
    vi.mocked(stripe.prices.create)
      .mockResolvedValueOnce({ id: "price_dead", active: false } as any)
      .mockResolvedValueOnce({ id: "price_fresh", active: true } as any);
    vi.mocked(stripe.prices.retrieve).mockResolvedValue({ id: "price_dead", active: false } as any);
    expect((await ensureClubPrice(args)).priceId).toBe("price_fresh");
  });

  it("replaces a matching active price whose product is archived", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue(
      price({ product: { id: "prod_old", active: false, metadata: {} } }) as any
    );
    const r = await ensureClubPrice({ ...args, currentPriceId: "price_old" });
    expect(r).toMatchObject({ created: true, productId: "prod_new", productCreated: true, previousPriceId: "price_old" });
  });

  it("creates a new product when the current price's product is archived", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue(
      price({ unit_amount: 999, product: { id: "prod_old", active: false, metadata: {} } }) as any
    );
    const r = await ensureClubPrice({ ...args, currentPriceId: "price_old" });
    expect(stripe.products.create).toHaveBeenCalled();
    expect(r).toMatchObject({ productId: "prod_new", productCreated: true, previousPriceId: "price_old" });
  });

  it("treats a deleted current price as absent", async () => {
    vi.mocked(stripe.prices.retrieve).mockRejectedValue(missing);
    const r = await ensureClubPrice({ ...args, currentPriceId: "price_gone" });
    expect(r).toMatchObject({ priceId: "price_new", productCreated: true, previousPriceId: null });
  });

  it("throws stripe_unavailable (and creates nothing) when the current price can't be read", async () => {
    vi.mocked(stripe.prices.retrieve).mockRejectedValue(outage);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ensureClubPrice({ ...args, currentPriceId: "price_old" })).rejects.toMatchObject({
      code: "stripe_unavailable",
    });
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });

  it("archives a product it just created when the price create fails", async () => {
    vi.mocked(stripe.prices.create).mockRejectedValue(outage);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ensureClubPrice(args)).rejects.toMatchObject({ code: "stripe_unavailable" });
    expect(stripe.products.update).toHaveBeenCalledWith("prod_new", { active: false });
  });
});

describe("disableClubPrice / rollbackClubPrices", () => {
  it("archives (never deletes) and swallows failures", async () => {
    vi.mocked(stripe.prices.update).mockRejectedValue(outage);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(disableClubPrice("price_x")).resolves.toBeUndefined();
    expect(stripe.prices.update).toHaveBeenCalledWith("price_x", { active: false });
    expect(spy).toHaveBeenCalled();
  });

  it("archives only what was created, and products only when newly created", async () => {
    await rollbackClubPrices([
      { priceId: "price_a", created: true, previousPriceId: null, productId: "prod_a", productCreated: true },
      { priceId: "price_b", created: true, previousPriceId: "price_old", productId: "prod_b", productCreated: false },
      { priceId: "price_c", created: false, previousPriceId: null, productId: "prod_c", productCreated: false },
    ]);
    expect(vi.mocked(stripe.prices.update).mock.calls.map((c) => c[0])).toEqual(["price_a", "price_b"]);
    expect(vi.mocked(stripe.products.update).mock.calls).toEqual([["prod_a", { active: false }]]);
  });
});

describe("renameClubProducts", () => {
  it("renames only app-created club products, best-effort", async () => {
    vi.mocked(stripe.prices.retrieve).mockImplementation((async (id: string) =>
      id === "price_ours"
        ? price({ id, product: { id: "prod_ours", active: true, metadata: { app: "club", kind: "coaching" } } })
        : price({ id, product: { id: "prod_manual", active: true, metadata: {} } })) as any);
    await renameClubProducts(["price_ours", "price_manual"], "New Name");
    expect(vi.mocked(stripe.products.update).mock.calls).toEqual([["prod_ours", { name: "New Name — Coaching" }]]);
  });

  it("never throws", async () => {
    vi.mocked(stripe.prices.retrieve).mockRejectedValue(outage);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(renameClubProducts(["price_x"], "X")).resolves.toBeUndefined();
  });
});

describe("describeClubPrice", () => {
  it("returns none without a price id", async () => {
    expect(await describeClubPrice(null)).toEqual({ status: "none" });
  });
  it("describes a USD monthly price", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue(price() as any);
    expect(await describeClubPrice("price_old")).toEqual({
      status: "ok", amountCents: 1499, label: "$14.99/mo", usdMonthly: true,
    });
  });
  it("flags a non-USD or non-monthly price", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue(
      price({ unit_amount: 10000, recurring: { interval: "year", interval_count: 1 } }) as any
    );
    expect(await describeClubPrice("price_old")).toMatchObject({ status: "ok", label: "$100.00/year", usdMonthly: false });
  });
  it("asks Stripe with a short timeout and no retries", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue(price() as any);
    await describeClubPrice("price_old");
    expect(stripe.prices.retrieve).toHaveBeenCalledWith("price_old", {}, { timeout: 5000, maxNetworkRetries: 0 });
  });
  it("returns unavailable on a timeout", async () => {
    vi.mocked(stripe.prices.retrieve).mockRejectedValue(
      Object.assign(new Error("Request aborted due to timeout"), { type: "StripeConnectionError" })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await describeClubPrice("price_old")).toEqual({ status: "unavailable" });
  });
  it("returns unsupported for a tiered price (no unit_amount)", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue(price({ unit_amount: null, billing_scheme: "tiered" }) as any);
    expect(await describeClubPrice("price_old")).toEqual({ status: "unsupported" });
  });
  it("returns unavailable when Stripe fails", async () => {
    vi.mocked(stripe.prices.retrieve).mockRejectedValue(outage);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await describeClubPrice("price_old")).toEqual({ status: "unavailable" });
  });
});
