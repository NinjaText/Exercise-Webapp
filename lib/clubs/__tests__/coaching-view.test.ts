import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({ stripe: { prices: { retrieve: vi.fn() } } }));
vi.mock("@/lib/org-capabilities.server", () => ({ getOrgForUser: vi.fn() }));
vi.mock("@/lib/services/coaching.service", () => ({ getCoachingForUser: vi.fn() }));

import { stripe } from "@/lib/stripe";
import { getOrgForUser } from "@/lib/org-capabilities.server";
import { getCoachingForUser } from "@/lib/services/coaching.service";
import { getCoachingViewModel } from "../coaching-view";

const member = { id: "u1", role: "CLIENT", clerkOrgId: "org_club" } as any;
const club = { clerkOrgId: "org_club", type: "CLUB", coachingStripePriceId: "price_c" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrgForUser).mockResolvedValue(club as any);
  vi.mocked(getCoachingForUser).mockResolvedValue(null);
  vi.mocked(stripe.prices.retrieve).mockResolvedValue({ unit_amount: 4900, currency: "usd", recurring: { interval: "month" } } as any);
});

describe("getCoachingViewModel", () => {
  it("returns status and price label for a club member", async () => {
    vi.mocked(getCoachingForUser).mockResolvedValue({ status: "ACCEPTED" } as any);
    expect(await getCoachingViewModel(member)).toEqual({ status: "ACCEPTED", priceLabel: "$49.00 / month" });
  });

  it("still returns the model when the price lookup fails", async () => {
    vi.mocked(stripe.prices.retrieve).mockRejectedValue(new Error("stripe down"));
    expect(await getCoachingViewModel(member)).toEqual({ status: null, priceLabel: null });
  });

  it("is null when the club does not offer coaching, with no queries", async () => {
    vi.mocked(getOrgForUser).mockResolvedValue({ ...club, coachingStripePriceId: null } as any);
    expect(await getCoachingViewModel(member)).toBeNull();
    expect(getCoachingForUser).not.toHaveBeenCalled();
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
  });

  it("is null for trainer-org clients with no coaching or Stripe queries", async () => {
    vi.mocked(getOrgForUser).mockResolvedValue({ clerkOrgId: "org_t", type: null, coachingStripePriceId: "price_c" } as any);
    expect(await getCoachingViewModel(member)).toBeNull();
    expect(getCoachingForUser).not.toHaveBeenCalled();
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
  });

  it("is null for non-clients without looking up the org", async () => {
    expect(await getCoachingViewModel({ ...member, role: "TRAINER" })).toBeNull();
    expect(getOrgForUser).not.toHaveBeenCalled();
  });
});
