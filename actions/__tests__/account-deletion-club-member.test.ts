import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * End-to-end through the real deletion services (only Prisma, Stripe and
 * Clerk are mocked): a club member's membership and coaching subscriptions
 * are cancelled before any row is deleted, and a Stripe failure leaves every
 * row in place.
 */
const calls = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/prisma", () => {
  const models = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
  const model = (name: string) => {
    if (!models.has(name)) {
      const ops: Record<string, ReturnType<typeof vi.fn>> = {};
      models.set(
        name,
        new Proxy(ops, {
          get(target, op: string) {
            if (!target[op]) {
              target[op] = vi.fn(async () => {
                calls.push(`${name}.${op}`);
                if (op === "findMany") return [];
                if (op === "count") return 0;
                return null;
              });
            }
            return target[op];
          },
        })
      );
    }
    return models.get(name)!;
  };
  return { prisma: new Proxy({}, { get: (_t, name: string) => model(name) }) };
});
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { cancel: vi.fn() },
    checkout: { sessions: { list: vi.fn(async () => ({ data: [] })), expire: vi.fn() } },
  },
}));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/services/coaching.service", () => ({ cancelCoachingForEndedMembership: vi.fn() }));
const deleteUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn(async () => ({ users: { deleteUser } })) }));

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/current-user";
import { deleteOwnAccountAction } from "../account-actions";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const member = { id: "u_member", clerkId: "clerk_m", role: "CLIENT" };
const trainer = { id: "u_trainer", clerkId: "clerk_t", role: "TRAINER" };

beforeEach(() => {
  calls.length = 0;
  vi.mocked(stripe.subscriptions.cancel).mockReset().mockImplementation((async (id: string) => {
    calls.push(`stripe.cancel:${id}`);
    return {};
  }) as never);
  p.memberSubscription.findUnique.mockReset().mockImplementation(async () => {
    calls.push("memberSubscription.findUnique");
    return { status: "ACTIVE", stripeCustomerId: "cus_m", stripeSubscriptionId: "sub_member" };
  });
  p.memberCoaching.findUnique.mockReset().mockImplementation(async () => {
    calls.push("memberCoaching.findUnique");
    return { status: "ACTIVE", stripeSubscriptionId: "sub_coach" };
  });
  p.trainerSubscription.findUnique.mockReset().mockImplementation(async () => {
    calls.push("trainerSubscription.findUnique");
    return { stripeSubscriptionId: "sub_trainer" };
  });
  deleteUser.mockReset().mockResolvedValue({});
});

const firstDelete = () => calls.findIndex((c) => /\.(deleteMany|delete)$/.test(c));

describe("club member account deletion", () => {
  it("cancels membership and coaching in Stripe, then deletes both rows and the user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(member as never);

    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });

    expect(result).toEqual({ success: true });
    const cancelCoach = calls.indexOf("stripe.cancel:sub_coach");
    const cancelMember = calls.indexOf("stripe.cancel:sub_member");
    expect(cancelCoach).toBeGreaterThanOrEqual(0);
    expect(cancelMember).toBeGreaterThanOrEqual(0);
    expect(Math.max(cancelCoach, cancelMember)).toBeLessThan(firstDelete());
    expect(p.memberCoaching.deleteMany).toHaveBeenCalledWith({ where: { userId: "u_member" } });
    expect(p.memberSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: "u_member" } });
    expect(calls.indexOf("memberSubscription.deleteMany")).toBeLessThan(calls.indexOf("user.delete"));
    expect(calls.indexOf("memberCoaching.deleteMany")).toBeLessThan(calls.indexOf("user.delete"));
    expect(deleteUser).toHaveBeenCalledWith("clerk_m");
  });

  it("aborts before any data is deleted when Stripe fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(member as never);
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValue(new Error("stripe down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });

    expect(result.success).toBe(false);
    expect(firstDelete()).toBe(-1);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("trainer deletion is unchanged: only the trainer subscription is cancelled (regression)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(trainer as never);

    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });

    expect(result).toEqual({ success: true });
    expect(vi.mocked(stripe.subscriptions.cancel).mock.calls).toEqual([["sub_trainer"]]);
    expect(calls).not.toContain("memberSubscription.findUnique");
    expect(calls.indexOf("stripe.cancel:sub_trainer")).toBeLessThan(firstDelete());
  });
});
