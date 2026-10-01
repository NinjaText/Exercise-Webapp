import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { memberSubscription: { findMany: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("@/lib/email/branding", () => ({
  getEmailBranding: vi.fn(async () => ({ organizationName: "Pine Valley", fromName: "Pine Valley", enabled: true })),
}));

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { getEmailBranding } from "@/lib/email/branding";
import { sendDueTrialReminders } from "../member-trial-reminder.service";

const now = new Date("2026-10-10T15:00:00Z");
const row = (overrides = {}) => ({
  id: "ms1", userId: "u1", clerkOrgId: "org_club", status: "TRIALING",
  trialEndsAt: new Date(now.getTime() + 20 * 3600_000), remindersSent: [],
  user: { email: "sam@example.com", firstName: "Sam", isActive: true },
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("sendDueTrialReminders", () => {
  it("skips members who already subscribed during their trial", async () => {
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([] as any);
    await sendDueTrialReminders(now);
    const where = vi.mocked(prisma.memberSubscription.findMany).mock.calls[0][0]!.where as any;
    expect(where).toMatchObject({ status: "TRIALING", OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: { isSet: false } }] });
    // A plain `stripeSubscriptionId: null` would miss rows that never had the field written.
    expect(where).not.toHaveProperty("stripeSubscriptionId");
  });

  it("sends the due reminder and records it", async () => {
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([row()] as any);
    expect(await sendDueTrialReminders(now)).toEqual({ checked: 1, sent: 1 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sam@example.com", subject: "Your free trial ends tomorrow" }));
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({
      where: { id: "ms1" }, data: { remindersSent: { push: "d1" } },
    });
  });
  it("does not record a reminder when the email failed (retried next run)", async () => {
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([row()] as any);
    vi.mocked(sendEmail).mockResolvedValueOnce(false);
    expect((await sendDueTrialReminders(now)).sent).toBe(0);
    expect(prisma.memberSubscription.update).not.toHaveBeenCalled();
  });
  it("skips reminders already sent and deactivated users", async () => {
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([
      row({ remindersSent: ["d1"] }),
      row({ id: "ms2", user: { email: "x@y.z", firstName: "X", isActive: false } }),
    ] as any);
    expect((await sendDueTrialReminders(now)).sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("continues past a row that throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([row(), row({ id: "ms2" })] as any);
    vi.mocked(getEmailBranding).mockRejectedValueOnce(new Error("boom"));
    expect(await sendDueTrialReminders(now)).toEqual({ checked: 2, sent: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(prisma.memberSubscription.update).toHaveBeenCalledTimes(1);
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({
      where: { id: "ms2" }, data: { remindersSent: { push: "d1" } },
    });
  });
});
