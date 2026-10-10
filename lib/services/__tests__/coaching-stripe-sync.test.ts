import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { memberCoaching: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getOrgForUser: vi.fn() }));
vi.mock("@/lib/services/notification.service", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/services/audit-log.service", () => ({ logUserAudit: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn(), cancel: vi.fn(), update: vi.fn() },
    invoices: { retrieve: vi.fn() },
    refunds: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  CoachingError,
  activateCoachingFromCheckout,
  markCoachingPastDue,
  syncCoachingFromStripe,
} from "../coaching.service";

const PERIOD_END = 1_800_000_000;
const ACCEPTED_AT = new Date(1_700_000_000 * 1000);
const META = { purchaseType: "member_coaching", userId: "u1" };

function sub(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "sub_coach", status, customer: "cus_1", metadata: META, cancel_at_period_end: false,
    created: 1_700_000_060,
    items: { data: [{ current_period_end: PERIOD_END }] },
    ...extra,
  } as any;
}

function row(status: string, stripeSubscriptionId: string | null = "sub_coach") {
  return {
    id: "mc1", userId: "u1", clerkOrgId: "org_club", status, stripeSubscriptionId, cancelAtPeriodEnd: false,
    respondedAt: ACCEPTED_AT,
  } as any;
}

/** The row as both lookups see it: by its stored sub id, and by userId. */
function stored(r: any) {
  vi.mocked(prisma.memberCoaching.findFirst).mockImplementation((async ({ where }: any) =>
    r && r.stripeSubscriptionId === where.stripeSubscriptionId ? r : null) as any);
  vi.mocked(prisma.memberCoaching.findUnique).mockImplementation((async ({ where }: any) =>
    r && r.userId === where.userId ? r : null) as any);
}

/** A subscription event whose live Stripe state (what `retrieve` returns) matches the snapshot. */
function sync(s: any, live: any = s) {
  vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(live);
  return syncCoachingFromStripe(s);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [prisma.memberCoaching.findFirst, prisma.memberCoaching.findUnique, prisma.memberCoaching.updateMany, stripe.subscriptions.cancel, stripe.subscriptions.retrieve]) {
    vi.mocked(fn as any).mockReset();
  }
  vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(stripe.subscriptions.cancel).mockResolvedValue({} as any);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  stored(null);
});

describe("syncCoachingFromStripe", () => {
  it("is not coaching (false, no writes) without the tag or a stored row", async () => {
    expect(await syncCoachingFromStripe(sub("active", { metadata: { purchaseType: "member_subscription", userId: "u1" } }))).toBe(false);
    expect(prisma.memberCoaching.findUnique).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it.each([
    ["active", "ACCEPTED", "ACTIVE"],
    ["trialing", "ACCEPTED", "ACTIVE"],
    ["active", "PAST_DUE", "ACTIVE"],
    ["past_due", "ACTIVE", "PAST_DUE"],
    ["unpaid", "ACTIVE", "PAST_DUE"],
    ["canceled", "ACTIVE", "CANCELED"],
    ["incomplete_expired", "PAST_DUE", "CANCELED"],
  ])("stripe %s moves %s → %s", async (stripeStatus, from, to) => {
    stored(row(from));
    expect(await sync(sub(stripeStatus))).toBe(true);
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: from, stripeSubscriptionId: "sub_coach" },
      data: expect.objectContaining({ status: to, stripeSubscriptionId: "sub_coach", currentPeriodEnd: new Date(PERIOD_END * 1000) }),
    });
  });

  it("adopts the subscription onto a row awaiting checkout, conditional on the id still being null", async () => {
    stored(row("ACCEPTED", null));
    await sync(sub("active"));
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "ACCEPTED", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }] },
      data: expect.objectContaining({ status: "ACTIVE", stripeSubscriptionId: "sub_coach" }),
    });
  });

  it("a renewal on ACTIVE updates only the period and cancel-at-period-end", async () => {
    stored(row("ACTIVE"));
    await sync(sub("active", { cancel_at_period_end: true }));
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "ACTIVE", stripeSubscriptionId: "sub_coach" },
      data: { stripeSubscriptionId: "sub_coach", currentPeriodEnd: new Date(PERIOD_END * 1000), cancelAtPeriodEnd: true },
    });
  });

  it("CANCELED clears cancelAtPeriodEnd", async () => {
    stored(row("ACTIVE"));
    await sync(sub("canceled", { cancel_at_period_end: true }));
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CANCELED", cancelAtPeriodEnd: false }),
    }));
  });

  it.each(["incomplete", "paused"])("%s moves nothing but is still handled", async (status) => {
    stored(row("ACCEPTED", null));
    expect(await sync(sub(status))).toBe(true);
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("an invalid move is ignored (payment_failed on ACCEPTED)", async () => {
    stored(row("ACCEPTED", null));
    expect(await sync(sub("past_due"))).toBe(true);
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("a replayed end on CANCELED writes nothing", async () => {
    stored(row("CANCELED"));
    expect(await sync(sub("canceled"))).toBe(true);
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("an untagged event for a stored subscription is still coaching", async () => {
    stored(row("ACTIVE"));
    expect(await sync(sub("past_due", { metadata: {} }))).toBe(true);
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalled();
  });

  it("a tagged live subscription with no coaching row is cancelled", async () => {
    expect(await sync(sub("active"))).toBe(true);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
  });

  it("a live subscription on a CANCELED row is cancelled idempotently (already-canceled error swallowed)", async () => {
    stored(row("CANCELED"));
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValue(new Error("No such subscription: sub_coach"));
    expect(await sync(sub("past_due"))).toBe(true);
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("re-reads after a lost race, then gives up with invalid_state", async () => {
    stored(row("ACCEPTED", null));
    vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValue({ count: 0 });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sync(sub("active"))).rejects.toBeInstanceOf(CoachingError);
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("adoption reads the live subscription, not the event snapshot", async () => {
    stored(row("ACCEPTED", null));
    expect(await sync(sub("active"), sub("canceled"))).toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_coach");
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("a stored subscription is applied from the event without a retrieve", async () => {
    stored(row("ACTIVE"));
    await sync(sub("past_due"));
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("a subscription created before the offer was accepted is never adopted (orphan: live → cancelled)", async () => {
    stored(row("ACCEPTED", null));
    expect(await sync(sub("active", { created: 1_699_999_000 }))).toBe(true);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
  });

  it("an ended pre-acceptance subscription is ignored", async () => {
    stored(row("ACCEPTED", null));
    await sync(sub("canceled", { created: 1_699_999_000 }));
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("PAST_DUE without a subscription does not adopt (ACCEPTED only)", async () => {
    stored(row("PAST_DUE", null));
    await sync(sub("active"));
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
  });

  it("tagged without a userId and no stored row: logged and skipped, never cancelled, still handled", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sync(sub("active", { metadata: { purchaseType: "member_coaching" } }))).toBe(true);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("no userId"));
    error.mockRestore();
  });
});

describe("activateCoachingFromCheckout", () => {
  it("retrieves the subscription and activates the member's row by session userId", async () => {
    stored(row("ACCEPTED", null));
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub("active", { metadata: {} }));
    await activateCoachingFromCheckout({ subscription: "sub_coach", metadata: META } as any);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_coach");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ACTIVE", stripeSubscriptionId: "sub_coach" }),
    }));
  });

  it("logs and skips a session without a userId or subscription", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await activateCoachingFromCheckout({ subscription: "sub_coach", metadata: { purchaseType: "member_coaching" } } as any);
    await activateCoachingFromCheckout({ subscription: null, metadata: META } as any);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("does not retrieve twice when adopting", async () => {
    stored(row("ACCEPTED", null));
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub("active"));
    await activateCoachingFromCheckout({ subscription: "sub_coach", metadata: META } as any);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
  });
});

describe("markCoachingPastDue", () => {
  it("not coaching (false) when no row stores the sub and the invoice isn't tagged", async () => {
    expect(await markCoachingPastDue("sub_member", { purchaseType: "member_subscription" })).toBe(false);
    expect(await markCoachingPastDue("sub_member")).toBe(false);
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("a tagged invoice with no linked row is still coaching (true), and writes nothing", async () => {
    expect(await markCoachingPastDue("sub_coach", META)).toBe(true);
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("ACTIVE → PAST_DUE, conditional on status and sub id", async () => {
    stored(row("ACTIVE"));
    expect(await markCoachingPastDue("sub_coach")).toBe(true);
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "ACTIVE", stripeSubscriptionId: "sub_coach" },
      data: { status: "PAST_DUE" },
    });
  });

  it.each(["PAST_DUE", "CANCELED"])("%s: handled, no write", async (status) => {
    stored(row(status));
    expect(await markCoachingPastDue("sub_coach")).toBe(true);
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });
});

describe("orphan refunds (subscriptions created < 24h ago)", () => {
  const recent = () => Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
  const paidInvoice = (payment: Record<string, unknown>) => ({
    id: "in_1", status: "paid", amount_paid: 4900,
    payments: { data: [{ status: "paid", payment }] },
  }) as any;

  beforeEach(() => {
    vi.mocked(stripe.invoices.retrieve).mockReset().mockResolvedValue(paidInvoice({ type: "payment_intent", payment_intent: "pi_1" }));
    vi.mocked(stripe.refunds.create).mockReset().mockResolvedValue({ id: "re_1" } as any);
  });

  it("cancels and refunds a fresh orphan's paid invoice via its payment intent, idempotently", async () => {
    expect(await sync(sub("active", { created: recent(), latest_invoice: "in_1" }))).toBe(true);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
    expect(stripe.invoices.retrieve).toHaveBeenCalledWith("in_1", { expand: ["payments"] });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_1" }),
      { idempotencyKey: "coaching-orphan-refund-sub_coach" }
    );
    expect(vi.mocked(stripe.subscriptions.cancel).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(stripe.refunds.create).mock.invocationCallOrder[0]
    );
  });

  it("falls back to the charge when the payment has no payment intent", async () => {
    vi.mocked(stripe.invoices.retrieve).mockResolvedValue(paidInvoice({ type: "charge", charge: { id: "ch_1" } }));
    await sync(sub("active", { created: recent(), latest_invoice: { id: "in_1" } }));
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ charge: "ch_1" }), expect.anything());
  });

  it("refunds an orphan on a CANCELED row too (paid after withdraw)", async () => {
    stored(row("CANCELED"));
    await sync(sub("active", { created: recent(), latest_invoice: "in_1" }));
    expect(stripe.refunds.create).toHaveBeenCalled();
  });

  it("never refunds an orphan older than 24h — cancel only", async () => {
    await sync(sub("active", { created: Math.floor(Date.now() / 1000) - 25 * 3600, latest_invoice: "in_1" }));
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
    expect(stripe.invoices.retrieve).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("skips an unpaid invoice", async () => {
    vi.mocked(stripe.invoices.retrieve).mockResolvedValue({ id: "in_1", status: "open", amount_paid: 0 } as any);
    await sync(sub("active", { created: recent(), latest_invoice: "in_1" }));
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("a refund failure is logged, not thrown (the cancel already happened)", async () => {
    vi.mocked(stripe.refunds.create).mockRejectedValue(new Error("stripe down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sync(sub("active", { created: recent(), latest_invoice: "in_1" }))).resolves.toBe(true);
    expect(error).toHaveBeenCalled();
  });

  it("an adopted (non-orphan) subscription is never refunded", async () => {
    stored(row("ACCEPTED", null));
    await sync(sub("active", { created: recent(), latest_invoice: "in_1" }));
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});
