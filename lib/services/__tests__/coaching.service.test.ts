import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    memberCoaching: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    memberSubscription: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getOrgForUser: vi.fn() }));
vi.mock("@/lib/services/house-coach.service", () => ({ requireHouseCoach: vi.fn() }));
vi.mock("@/lib/services/notification.service", () => ({ notifyUser: vi.fn(async () => {}) }));
const audited = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("@/lib/services/audit-log.service", () => ({
  logUserAudit: vi.fn(async (_u: unknown, build: () => Record<string, unknown>) => {
    audited.push(await build());
  }),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { update: vi.fn(async () => ({})), cancel: vi.fn(async () => ({})) },
    checkout: { sessions: { list: vi.fn(async () => ({ data: [] })), expire: vi.fn(async () => ({})) } },
  },
}));
vi.mock("@/lib/utils/app-url", () => ({ appBaseUrl: () => "https://app.test" }));

import { prisma } from "@/lib/prisma";
import { getOrgForUser } from "@/lib/org-capabilities.server";
import { requireHouseCoach } from "@/lib/services/house-coach.service";
import { notifyUser } from "@/lib/services/notification.service";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { stripe } from "@/lib/stripe";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import {
  CoachingError,
  cancelCoachingForEndedMembership,
  endCoaching,
  expireOpenCoachingCheckouts,
  getCoachingForUser,
  listCoachingRequests,
  requestCoaching,
  respondToCoachingRequest,
  sweepCoachingForExpiredTrials,
  withdrawCoaching,
} from "../coaching.service";

const MEMBER_ID = "64b7f0c2a1b2c3d4e5f60718";
const TRAINER_ID = "64b7f0c2a1b2c3d4e5f60799";

const member = {
  id: MEMBER_ID, role: "CLIENT", clerkOrgId: "org_club", firstName: "Sam", lastName: "Lee", email: "sam@x.test",
} as any;
const trainer = {
  id: TRAINER_ID, role: "TRAINER", clerkOrgId: "org_club", firstName: "Mike", lastName: "Chen", email: "mike@x.test",
} as any;
const otherTrainer = { ...trainer, id: "64b7f0c2a1b2c3d4e5f60700", clerkOrgId: "org_other" } as any;

const club = { clerkOrgId: "org_club", name: "Pine Valley", type: "CLUB", coachingStripePriceId: "price_coach" } as any;
const okSub = { status: "ACTIVE", trialEndsAt: new Date("2020-01-01"), stripeSubscriptionId: "sub_member" } as any;

function row(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "mc1", userId: MEMBER_ID, clerkOrgId: "org_club", status, requestNote: "Help", responseNote: null,
    requestedAt: new Date(), respondedAt: null, respondedById: null, stripeSubscriptionId: null,
    currentPeriodEnd: null, cancelAtPeriodEnd: false,
    user: { id: MEMBER_ID, firstName: "Sam", lastName: "Lee", email: "sam@x.test" },
    ...extra,
  } as any;
}

async function expectCode(p: Promise<unknown>, code: CoachingError["code"]) {
  await expect(p).rejects.toBeInstanceOf(CoachingError);
  await expect(p).rejects.toMatchObject({ code });
}

beforeEach(() => {
  vi.clearAllMocks();
  audited.length = 0;
  // clearAllMocks keeps queued *Once values; drop any a failing guard left unconsumed.
  for (const fn of [
    prisma.memberCoaching.findUnique, prisma.memberCoaching.create, prisma.memberCoaching.updateMany,
    prisma.memberSubscription.findUnique, stripe.subscriptions.cancel, stripe.subscriptions.update,
  ]) vi.mocked(fn as any).mockReset();
  vi.mocked(getOrgForUser).mockResolvedValue(club);
  vi.mocked(requireHouseCoach).mockResolvedValue(trainer);
  vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(okSub);
  vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.memberCoaching.create).mockImplementation((async (args: any) => ({ id: "mc1", ...args.data })) as any);
  vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.restoreAllMocks(); // undoes console spies
});

describe("getCoachingForUser", () => {
  it("reads the member's row", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(row("ACTIVE"));
    expect((await getCoachingForUser(MEMBER_ID))?.status).toBe("ACTIVE");
    expect(prisma.memberCoaching.findUnique).toHaveBeenCalledWith({ where: { userId: MEMBER_ID } });
  });
});

describe("requestCoaching", () => {
  it("creates a REQUESTED row with the trimmed note, notifies the house coach and audits", async () => {
    const res = await requestCoaching(member, "  Help with my squat  ");
    expect(res.status).toBe("REQUESTED");
    expect(prisma.memberCoaching.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: MEMBER_ID, clerkOrgId: "org_club", status: "REQUESTED", requestNote: "Help with my squat",
        // Explicit nulls: Mongo `{ field: null }` filters miss unwritten fields.
        responseNote: null, respondedAt: null, respondedById: null, stripeSubscriptionId: null, currentPeriodEnd: null,
      }),
    });
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TRAINER_ID,
        type: NOTIFICATION_TYPES.COACHING_REQUESTED,
        link: `/clients/${MEMBER_ID}`,
        email: expect.objectContaining({
          memberName: "Sam Lee",
          note: "Help with my squat",
          clientLink: `https://app.test/clients/${MEMBER_ID}`,
        }),
      })
    );
    expect(logUserAudit).toHaveBeenCalledWith(member, expect.any(Function));
    expect(audited[0]).toMatchObject({ action: "COACHING_REQUESTED", targetId: MEMBER_ID });
  });

  it("re-requests from DECLINED / CANCELED with a conditional write that resets the cycle", async () => {
    for (const status of ["DECLINED", "CANCELED"]) {
      vi.mocked(prisma.memberCoaching.findUnique)
        .mockResolvedValueOnce(row(status, { responseNote: "no", stripeSubscriptionId: "sub_old" }))
        .mockResolvedValueOnce(row("REQUESTED"));
      const res = await requestCoaching(member, "again");
      expect(res.status).toBe("REQUESTED");
      expect(prisma.memberCoaching.updateMany).toHaveBeenLastCalledWith({
        where: { userId: MEMBER_ID, status },
        data: expect.objectContaining({
          status: "REQUESTED", requestNote: "again", responseNote: null, respondedAt: null,
          respondedById: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
        }),
      });
    }
    expect(prisma.memberCoaching.create).not.toHaveBeenCalled();
  });

  it("refuses while a request is already open", async () => {
    for (const status of ["REQUESTED", "ACCEPTED", "ACTIVE", "PAST_DUE"]) {
      vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row(status));
      await expectCode(requestCoaching(member, "hi"), "invalid_state");
    }
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("loses a re-request race (count 0) as invalid_state, without notifying", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("CANCELED"));
    vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValueOnce({ count: 0 });
    await expectCode(requestCoaching(member, "hi"), "invalid_state");
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("on a concurrent first request (P2002) refuses when the winner is already REQUESTED", async () => {
    vi.mocked(prisma.memberCoaching.create).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(row("REQUESTED"));
    await expectCode(requestCoaching(member, "hi"), "invalid_state");
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("on P2002 falls back to the conditional update when the existing row allows a request", async () => {
    vi.mocked(prisma.memberCoaching.create).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row("CANCELED"))
      .mockResolvedValueOnce(row("REQUESTED"));
    expect((await requestCoaching(member, "hi")).status).toBe("REQUESTED");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MEMBER_ID, status: "CANCELED" } })
    );
  });

  it("rethrows unexpected create errors", async () => {
    vi.mocked(prisma.memberCoaching.create).mockRejectedValueOnce(new Error("boom"));
    await expect(requestCoaching(member, "hi")).rejects.toThrow("boom");
  });

  it("refuses a trainer (not_eligible)", async () => {
    await expectCode(requestCoaching(trainer, "hi"), "not_eligible");
  });

  it("refuses a trainer-org client and touches nothing (regression)", async () => {
    vi.mocked(getOrgForUser).mockResolvedValue({ clerkOrgId: "org_t", name: "Studio", type: "TRAINER" } as any);
    await expectCode(requestCoaching({ ...member, clerkOrgId: "org_t" }, "hi"), "not_eligible");
    vi.mocked(getOrgForUser).mockResolvedValue({ clerkOrgId: "org_t", name: "Legacy" } as any); // no type key
    await expectCode(requestCoaching({ ...member, clerkOrgId: "org_t" }, "hi"), "not_eligible");
    expect(prisma.memberCoaching.create).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("refuses a member with no org", async () => {
    vi.mocked(getOrgForUser).mockResolvedValue(null);
    await expectCode(requestCoaching({ ...member, clerkOrgId: null }, "hi"), "not_eligible");
  });

  it("refuses when the club has no coaching price (not_offered)", async () => {
    vi.mocked(getOrgForUser).mockResolvedValue({ ...club, coachingStripePriceId: null });
    await expectCode(requestCoaching(member, "hi"), "not_offered");
  });

  it("does not create a house coach for an ineligible request or blank note", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(null);
    await expectCode(requestCoaching(member, "hi"), "not_eligible");
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(okSub);
    await expectCode(requestCoaching(member, "  "), "invalid_input");
    expect(requireHouseCoach).not.toHaveBeenCalled();
  });

  it("notifies the club's house coach", async () => {
    await requestCoaching(member, "hi");
    expect(requireHouseCoach).toHaveBeenCalledWith("org_club");
    expect(notifyUser).toHaveBeenCalledWith(expect.objectContaining({ userId: TRAINER_ID }));
  });

  it("refuses when the membership gate is not ok", async () => {
    for (const sub of [
      null,
      { status: "CANCELED", trialEndsAt: new Date("2099-01-01"), stripeSubscriptionId: null },
      { status: "PAST_DUE", trialEndsAt: new Date("2020-01-01"), stripeSubscriptionId: "s" },
      { status: "TRIALING", trialEndsAt: new Date("2020-01-01"), stripeSubscriptionId: null },
    ]) {
      vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValueOnce(sub as any);
      await expectCode(requestCoaching(member, "hi"), "not_eligible");
    }
  });

  it("allows a member in an active trial", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValueOnce({
      status: "TRIALING", trialEndsAt: new Date("2099-01-01"), stripeSubscriptionId: null,
    } as any);
    expect((await requestCoaching(member, "hi")).status).toBe("REQUESTED");
  });

  it("requires a 1–1000 character note after trimming", async () => {
    await expectCode(requestCoaching(member, "   "), "invalid_input");
    await expectCode(requestCoaching(member, "x".repeat(1001)), "invalid_input");
    expect((await requestCoaching(member, ` ${"x".repeat(1000)} `)).status).toBe("REQUESTED");
  });
});

describe("respondToCoachingRequest", () => {
  beforeEach(() => {
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row("REQUESTED"))
      .mockResolvedValueOnce(row("ACCEPTED"));
  });

  it("accepts: conditional write, member notified with a dashboard link, audited", async () => {
    const res = await respondToCoachingRequest(trainer, MEMBER_ID, true, "  Let's go ");
    expect(res.status).toBe("ACCEPTED");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status: "REQUESTED" },
      data: expect.objectContaining({ status: "ACCEPTED", responseNote: "Let's go", respondedById: TRAINER_ID }),
    });
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MEMBER_ID,
        type: NOTIFICATION_TYPES.COACHING_ACCEPTED,
        link: "/dashboard",
        email: expect.objectContaining({
          trainerName: "Mike Chen", clubName: "Pine Valley", dashboardLink: "https://app.test/dashboard",
        }),
      })
    );
    expect(logUserAudit).toHaveBeenCalledWith(trainer, expect.any(Function));
    expect(audited[0]).toMatchObject({ action: "COACHING_ACCEPTED", targetId: MEMBER_ID, targetLabel: "Sam Lee" });
  });

  it("declines with the trainer's note in the notification", async () => {
    await respondToCoachingRequest(trainer, MEMBER_ID, false, "Fully booked");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status: "REQUESTED" },
      data: expect.objectContaining({ status: "DECLINED", responseNote: "Fully booked" }),
    });
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MEMBER_ID,
        type: NOTIFICATION_TYPES.COACHING_DECLINED,
        link: "/dashboard",
        body: expect.stringContaining("Fully booked"),
        email: expect.objectContaining({ note: "Fully booked" }),
      })
    );
    expect(audited[0]).toMatchObject({ action: "COACHING_DECLINED" });
  });

  it("declines without a note", async () => {
    await respondToCoachingRequest(trainer, MEMBER_ID, false);
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DECLINED", responseNote: null }) })
    );
  });

  it("refuses a trainer from another org, and a client", async () => {
    await expectCode(respondToCoachingRequest(otherTrainer, MEMBER_ID, true), "forbidden");
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("REQUESTED"));
    await expectCode(respondToCoachingRequest(member, MEMBER_ID, true), "forbidden");
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a trainer with no org", async () => {
    await expectCode(respondToCoachingRequest({ ...trainer, clerkOrgId: null }, MEMBER_ID, true), "forbidden");
  });

  it("not_found for no row or a malformed id", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockReset().mockResolvedValue(null);
    await expectCode(respondToCoachingRequest(trainer, MEMBER_ID, true), "not_found");
    await expectCode(respondToCoachingRequest(trainer, "nope", true), "not_found");
  });

  it("refuses a response to a row that is not REQUESTED", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockReset().mockResolvedValue(row("ACCEPTED"));
    await expectCode(respondToCoachingRequest(trainer, MEMBER_ID, true), "invalid_state");
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("loses a race (count 0) as invalid_state, without notifying", async () => {
    vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValueOnce({ count: 0 });
    await expectCode(respondToCoachingRequest(trainer, MEMBER_ID, true), "invalid_state");
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("rejects a note over 1000 characters", async () => {
    await expectCode(respondToCoachingRequest(trainer, MEMBER_ID, false, "x".repeat(1001)), "invalid_input");
    await expect(respondToCoachingRequest(trainer, MEMBER_ID, false, "x".repeat(1001))).rejects.toThrow(
      "Notes must be 1–1000 characters."
    );
  });
});

describe("withdrawCoaching", () => {
  it.each(["REQUESTED", "ACCEPTED"])("the member withdraws from %s → CANCELED", async (status) => {
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row(status))
      .mockResolvedValueOnce(row("CANCELED"));
    expect((await withdrawCoaching(member, MEMBER_ID)).status).toBe("CANCELED");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status },
      data: expect.objectContaining({ status: "CANCELED" }),
    });
  });

  it("the club trainer withdraws an accepted offer, audited", async () => {
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row("ACCEPTED"))
      .mockResolvedValueOnce(row("CANCELED"));
    expect((await withdrawCoaching(trainer, MEMBER_ID)).status).toBe("CANCELED");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status: "ACCEPTED" },
      data: { status: "CANCELED" },
    });
    expect(logUserAudit).toHaveBeenCalledWith(trainer, expect.any(Function));
    expect(audited[0]).toMatchObject({ action: "COACHING_WITHDRAWN", metadata: { from: "ACCEPTED" } });
  });

  it("refuses another member or another org's trainer", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(row("REQUESTED"));
    await expectCode(withdrawCoaching({ ...member, id: "64b7f0c2a1b2c3d4e5f60711" }, MEMBER_ID), "forbidden");
    await expectCode(withdrawCoaching(otherTrainer, MEMBER_ID), "forbidden");
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("refuses paid or ended coaching", async () => {
    for (const status of ["ACTIVE", "PAST_DUE", "DECLINED", "CANCELED"]) {
      vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row(status));
      await expectCode(withdrawCoaching(member, MEMBER_ID), "invalid_state");
    }
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("loses a race (count 0) as invalid_state", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("REQUESTED"));
    vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValueOnce({ count: 0 });
    await expectCode(withdrawCoaching(member, MEMBER_ID), "invalid_state");
  });
});

describe("endCoaching", () => {
  it.each(["ACTIVE", "PAST_DUE"])("%s: cancels at period end in Stripe and flags the row; status unchanged", async (status) => {
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row(status, { stripeSubscriptionId: "sub_coach" }))
      .mockResolvedValueOnce(row(status, { stripeSubscriptionId: "sub_coach", cancelAtPeriodEnd: true }));
    const res = await endCoaching(trainer, MEMBER_ID);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_coach", { cancel_at_period_end: true });
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status, stripeSubscriptionId: "sub_coach" },
      data: { cancelAtPeriodEnd: true },
    });
    expect(res).toMatchObject({ status, cancelAtPeriodEnd: true });
    expect(logUserAudit).toHaveBeenCalledWith(trainer, expect.any(Function));
    expect(audited[0]).toMatchObject({ action: "COACHING_ENDED", metadata: { from: status, atPeriodEnd: true } });
  });

  it("ACCEPTED (unpaid): CANCELED directly, no Stripe call", async () => {
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row("ACCEPTED"))
      .mockResolvedValueOnce(row("CANCELED"));
    expect((await endCoaching(trainer, MEMBER_ID)).status).toBe("CANCELED");
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status: "ACCEPTED" },
      data: expect.objectContaining({ status: "CANCELED" }),
    });
  });

  it("already ending: returns the row without calling Stripe again", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(
      row("ACTIVE", { stripeSubscriptionId: "sub_coach", cancelAtPeriodEnd: true })
    );
    expect((await endCoaching(trainer, MEMBER_ID)).cancelAtPeriodEnd).toBe(true);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a member, another org's trainer, and REQUESTED/terminal rows", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValue(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }));
    await expectCode(endCoaching(member, MEMBER_ID), "forbidden");
    await expectCode(endCoaching(otherTrainer, MEMBER_ID), "forbidden");
    for (const status of ["REQUESTED", "DECLINED", "CANCELED"]) {
      vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row(status));
      await expectCode(endCoaching(trainer, MEMBER_ID), "invalid_state");
    }
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("ACTIVE without a subscription id is invalid_state", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACTIVE"));
    await expectCode(endCoaching(trainer, MEMBER_ID), "invalid_state");
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("loses a race with the deleted webhook (count 0) as invalid_state", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }));
    vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValueOnce({ count: 0 });
    await expectCode(endCoaching(trainer, MEMBER_ID), "invalid_state");
  });
});

describe("cancelCoachingForEndedMembership", () => {
  it.each(["ACTIVE", "PAST_DUE"])("%s with a subscription: cancels in Stripe now, then CANCELED", async (status) => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row(status, { stripeSubscriptionId: "sub_coach" }));
    await cancelCoachingForEndedMembership(MEMBER_ID);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status },
      data: expect.objectContaining({ status: "CANCELED" }),
    });
  });

  it.each(["REQUESTED", "ACCEPTED"])("%s: CANCELED without Stripe", async (status) => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row(status));
    await cancelCoachingForEndedMembership(MEMBER_ID);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status },
      data: expect.objectContaining({ status: "CANCELED" }),
    });
  });

  it.each([null, "DECLINED", "CANCELED"])("%s: no-op", async (status) => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(status ? row(status) : null);
    await cancelCoachingForEndedMembership(MEMBER_ID);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("swallows an already-canceled Stripe error and still writes CANCELED", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }));
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValueOnce(
      Object.assign(new Error("No such subscription: sub_coach"), { code: "resource_missing" })
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await cancelCoachingForEndedMembership(MEMBER_ID);
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalled();
  });

  it("propagates other Stripe errors and leaves the row alone", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }));
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValueOnce(new Error("network"));
    await expect(cancelCoachingForEndedMembership(MEMBER_ID)).rejects.toThrow("network");
    expect(prisma.memberCoaching.updateMany).not.toHaveBeenCalled();
  });

  it("throws invalid_state after losing the race twice, so the caller doesn't treat it as done", async () => {
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row("REQUESTED"))
      .mockResolvedValueOnce(row("ACCEPTED"));
    vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValue({ count: 0 });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expectCode(cancelCoachingForEndedMembership(MEMBER_ID), "invalid_state");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalled();
  });

  it("re-reads after a lost race and cancels the newer status", async () => {
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row("ACCEPTED"))
      .mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }));
    vi.mocked(prisma.memberCoaching.updateMany).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await cancelCoachingForEndedMembership(MEMBER_ID);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
    expect(prisma.memberCoaching.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: MEMBER_ID, status: "ACTIVE" } })
    );
  });
});

describe("listCoachingRequests", () => {
  it("lists the org's REQUESTED rows, oldest first, with the member", async () => {
    vi.mocked(prisma.memberCoaching.findMany).mockResolvedValue([row("REQUESTED")]);
    const res = await listCoachingRequests("org_club");
    expect(res).toHaveLength(1);
    expect(prisma.memberCoaching.findMany).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_club", status: "REQUESTED" },
      orderBy: { requestedAt: "asc" },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  });
});

// ── Final review: open checkouts can't be paid after the offer is gone ──────

const COACH_SESSION = { id: "cs_coach", metadata: { purchaseType: "member_coaching", userId: MEMBER_ID } };
const MEMBER_SESSION = { id: "cs_member", metadata: { purchaseType: "member_subscription", userId: MEMBER_ID } };

function withCustomer() {
  vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ ...okSub, stripeCustomerId: "cus_1" });
  vi.mocked(stripe.checkout.sessions.list).mockResolvedValue({ data: [COACH_SESSION, MEMBER_SESSION] } as any);
}

describe("expireOpenCoachingCheckouts", () => {
  beforeEach(() => {
    vi.mocked(stripe.checkout.sessions.list).mockReset().mockResolvedValue({ data: [COACH_SESSION, MEMBER_SESSION] } as any);
    vi.mocked(stripe.checkout.sessions.expire).mockReset().mockResolvedValue({} as any);
  });

  it("expires only the customer's open coaching sessions", async () => {
    expect(await expireOpenCoachingCheckouts("cus_1")).toBe(1);
    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "open", limit: 100 });
    expect(vi.mocked(stripe.checkout.sessions.expire).mock.calls).toEqual([["cs_coach"]]);
  });

  it("propagates a Stripe failure to the caller", async () => {
    vi.mocked(stripe.checkout.sessions.list).mockRejectedValueOnce(new Error("stripe down"));
    await expect(expireOpenCoachingCheckouts("cus_1")).rejects.toThrow("stripe down");
  });
});

describe("open coaching checkouts are expired when the offer closes", () => {
  beforeEach(() => {
    vi.mocked(stripe.checkout.sessions.list).mockReset().mockResolvedValue({ data: [] } as any);
    vi.mocked(stripe.checkout.sessions.expire).mockReset().mockResolvedValue({} as any);
  });

  it.each(["REQUESTED", "ACCEPTED"])("withdrawCoaching from %s expires the open coaching checkout", async (status) => {
    withCustomer();
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row(status)).mockResolvedValueOnce(row("CANCELED"));
    await withdrawCoaching(member, MEMBER_ID);
    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "open", limit: 100 });
    expect(vi.mocked(stripe.checkout.sessions.expire).mock.calls).toEqual([["cs_coach"]]);
  });

  it("withdrawCoaching skips Stripe when the member has no customer yet", async () => {
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACCEPTED")).mockResolvedValueOnce(row("CANCELED"));
    await withdrawCoaching(member, MEMBER_ID);
    expect(stripe.checkout.sessions.list).not.toHaveBeenCalled();
  });

  it("a Stripe failure while expiring is logged, and the withdraw still succeeds", async () => {
    withCustomer();
    vi.mocked(stripe.checkout.sessions.list).mockRejectedValueOnce(new Error("stripe down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACCEPTED")).mockResolvedValueOnce(row("CANCELED"));
    expect((await withdrawCoaching(member, MEMBER_ID)).status).toBe("CANCELED");
    expect(error).toHaveBeenCalled();
  });

  it("endCoaching on an ACCEPTED offer expires the open checkout", async () => {
    withCustomer();
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACCEPTED")).mockResolvedValueOnce(row("CANCELED"));
    await endCoaching(trainer, MEMBER_ID);
    expect(vi.mocked(stripe.checkout.sessions.expire).mock.calls).toEqual([["cs_coach"]]);
  });

  it("endCoaching on paid coaching leaves checkouts alone", async () => {
    withCustomer();
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }))
      .mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach", cancelAtPeriodEnd: true }));
    await endCoaching(trainer, MEMBER_ID);
    expect(stripe.checkout.sessions.list).not.toHaveBeenCalled();
  });

  it.each(["REQUESTED", "ACCEPTED"])("cancelCoachingForEndedMembership from %s expires the open checkout", async (status) => {
    withCustomer();
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row(status));
    await cancelCoachingForEndedMembership(MEMBER_ID);
    expect(vi.mocked(stripe.checkout.sessions.expire).mock.calls).toEqual([["cs_coach"]]);
  });

  it("cancelCoachingForEndedMembership from ACTIVE cancels the subscription, no checkout expiry", async () => {
    withCustomer();
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }));
    await cancelCoachingForEndedMembership(MEMBER_ID);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
    expect(stripe.checkout.sessions.list).not.toHaveBeenCalled();
  });
});

describe("sweepCoachingForExpiredTrials", () => {
  const NOW = new Date("2026-10-01T12:00:00Z");

  it("cancels open coaching of members whose no-card trial has ended", async () => {
    vi.mocked(prisma.memberCoaching.findMany).mockResolvedValue([{ userId: MEMBER_ID }] as any);
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([{ userId: MEMBER_ID }] as any);
    vi.mocked(prisma.memberCoaching.findUnique).mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }));

    expect(await sweepCoachingForExpiredTrials(NOW)).toEqual({ checked: 1, canceled: 1 });

    expect(prisma.memberCoaching.findMany).toHaveBeenCalledWith({
      where: { status: { in: ["REQUESTED", "ACCEPTED", "ACTIVE", "PAST_DUE"] } },
      select: { userId: true },
    });
    // Scheduled subscriptions (stripeSubscriptionId set) keep access past trialEndsAt — excluded.
    expect(prisma.memberSubscription.findMany).toHaveBeenCalledWith({
      where: { userId: { in: [MEMBER_ID] }, status: "TRIALING", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }], trialEndsAt: { lt: NOW } },
      select: { userId: true },
    });
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_coach");
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, status: "ACTIVE" },
      data: expect.objectContaining({ status: "CANCELED" }),
    });
  });

  it("does nothing (and skips the membership query) when no coaching is open", async () => {
    vi.mocked(prisma.memberCoaching.findMany).mockResolvedValue([]);
    expect(await sweepCoachingForExpiredTrials(NOW)).toEqual({ checked: 0, canceled: 0 });
    expect(prisma.memberSubscription.findMany).not.toHaveBeenCalled();
  });

  it("one member's failure is logged and never stops the rest", async () => {
    const OTHER = "64b7f0c2a1b2c3d4e5f60720";
    vi.mocked(prisma.memberCoaching.findMany).mockResolvedValue([{ userId: MEMBER_ID }, { userId: OTHER }] as any);
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([{ userId: MEMBER_ID }, { userId: OTHER }] as any);
    vi.mocked(prisma.memberCoaching.findUnique)
      .mockResolvedValueOnce(row("ACTIVE", { stripeSubscriptionId: "sub_coach" }))
      .mockResolvedValueOnce(row("REQUESTED", { userId: OTHER }));
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValueOnce(new Error("stripe down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await sweepCoachingForExpiredTrials(NOW)).toEqual({ checked: 2, canceled: 1 });
    expect(error).toHaveBeenCalled();
    expect(prisma.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { userId: OTHER, status: "REQUESTED" },
      data: expect.objectContaining({ status: "CANCELED" }),
    });
  });
});
