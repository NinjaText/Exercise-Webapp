import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  chargesList: vi.fn(),
  userFindMany: vi.fn(),
  offerSubscriptionFindMany: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({ stripe: { charges: { list: mocks.chargesList } } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    offerSubscription: { findMany: mocks.offerSubscriptionFindMany },
  },
}));

import { listRecentCharges } from "../connect-dashboard.service";

const CLIENT_ID = "6adb4c180996513f8c2d9548";

function charge(overrides: Record<string, unknown>) {
  return {
    id: "ch_1",
    status: "succeeded",
    amount: 1000,
    amount_refunded: 0,
    refunded: false,
    currency: "usd",
    created: 1_790_000_000,
    description: "QA Monthly Coaching",
    metadata: {},
    billing_details: { email: null, name: null },
    receipt_email: null,
    customer: null,
    failure_message: null,
    ...overrides,
  };
}

describe("listRecentCharges customer labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindMany.mockResolvedValue([
      { id: CLIENT_ID, email: "casey@example.com", firstName: "Casey", lastName: "Client" },
    ]);
  });

  it("names a renewal charge with no metadata or email through its membership's Stripe customer", async () => {
    mocks.chargesList.mockResolvedValue({ data: [charge({ status: "failed", customer: "cus_123" })] });
    mocks.offerSubscriptionFindMany.mockResolvedValue([{ stripeCustomerId: "cus_123", clientId: CLIENT_ID }]);

    const result = await listRecentCharges("acct_trainer", "org_1");

    expect(result.ok && result.data[0].customerLabel).toBe("Casey Client");
    expect(mocks.offerSubscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripeAccountId: "acct_trainer", stripeCustomerId: { in: ["cus_123"] } } })
    );
  });

  it("falls back to Unknown customer when nothing links the charge to a client", async () => {
    mocks.chargesList.mockResolvedValue({ data: [charge({ customer: "cus_unknown" })] });
    mocks.offerSubscriptionFindMany.mockResolvedValue([]);
    mocks.userFindMany.mockResolvedValue([]);

    const result = await listRecentCharges("acct_trainer", "org_1");

    expect(result.ok && result.data[0].customerLabel).toBe("Unknown customer");
  });
});
