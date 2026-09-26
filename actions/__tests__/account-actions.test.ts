import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/services/user-deletion.service", () => ({
  findDeletionBlockers: vi.fn(),
  deleteUserData: vi.fn(),
}));
const deleteUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser } })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { trainerSubscription: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { subscriptions: { cancel: vi.fn() } },
}));

import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { findDeletionBlockers, deleteUserData } from "@/lib/services/user-deletion.service";
import { deleteOwnAccountAction } from "../account-actions";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockFindBlockers = vi.mocked(findDeletionBlockers);
const mockDeleteUserData = vi.mocked(deleteUserData);
const mockFindSubscription = vi.mocked(prisma.trainerSubscription.findUnique);
const mockCancelSubscription = vi.mocked(stripe.subscriptions.cancel);

const trainer = { id: "u_trainer", clerkId: "clerk_t", role: "TRAINER" };
const client = { id: "u_client", clerkId: "clerk_c", role: "CLIENT" };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindBlockers.mockResolvedValue([]);
  mockDeleteUserData.mockResolvedValue(undefined);
  deleteUser.mockResolvedValue({});
  mockFindSubscription.mockResolvedValue({ stripeSubscriptionId: "sub_1" } as never);
  mockCancelSubscription.mockResolvedValue({} as never);
});

describe("deleteOwnAccountAction", () => {
  it("rejects a wrong confirmation phrase without touching data", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    const result = await deleteOwnAccountAction({ confirmation: "delete me" });
    expect(result.success).toBe(false);
    expect(mockFindBlockers).not.toHaveBeenCalled();
    expect(mockDeleteUserData).not.toHaveBeenCalled();
  });

  it("deletes a client's data and Clerk user", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(result).toEqual({ success: true });
    expect(mockFindBlockers).toHaveBeenCalledWith("u_client", { includeActiveClients: false });
    expect(mockDeleteUserData).toHaveBeenCalledWith("u_client");
    expect(deleteUser).toHaveBeenCalledWith("clerk_c");
  });

  it("checks active clients for trainers and returns blockers", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never);
    const blocker = { code: "ACTIVE_CLIENTS" as const, count: 2, message: "you still have 2 active client(s). Deactivate or reassign them before deleting your account." };
    mockFindBlockers.mockResolvedValue([blocker]);
    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(mockFindBlockers).toHaveBeenCalledWith("u_trainer", { includeActiveClients: true });
    expect(result).toEqual({ success: false, error: blocker.message, blockers: [blocker] });
    expect(mockDeleteUserData).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports a data-removal failure and leaves Clerk alone", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    mockDeleteUserData.mockRejectedValue(new Error("db down"));
    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(result.success).toBe(false);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("still succeeds if the Clerk delete fails after data is gone", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    deleteUser.mockRejectedValue(new Error("clerk 500"));
    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(result).toEqual({ success: true });
  });
  // The path an App Store reviewer exercises: a trainer with nothing blocking
  // them deletes their account and stops being billed.
  it("cancels the trainer's Stripe subscription, then deletes their data and Clerk user", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never);

    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });

    expect(result).toEqual({ success: true });
    expect(mockFindBlockers).toHaveBeenCalledWith("u_trainer", { includeActiveClients: true });
    expect(mockCancelSubscription).toHaveBeenCalledWith("sub_1");
    expect(mockDeleteUserData).toHaveBeenCalledWith("u_trainer");
    expect(deleteUser).toHaveBeenCalledWith("clerk_t");
    // Billing must stop before the row holding the subscription id is gone.
    expect(mockCancelSubscription.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteUserData.mock.invocationCallOrder[0]
    );
  });

  it("aborts without deleting anything when the Stripe cancellation fails", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never);
    mockCancelSubscription.mockRejectedValue(new Error("stripe down"));

    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });

    expect(result.success).toBe(false);
    expect(mockDeleteUserData).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("treats an already-cancelled Stripe subscription as success", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never);
    mockCancelSubscription.mockRejectedValue(
      Object.assign(new Error("No such subscription: sub_1"), { code: "resource_missing" })
    );

    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });

    expect(result).toEqual({ success: true });
    expect(mockDeleteUserData).toHaveBeenCalledWith("u_trainer");
  });

  it("does not touch Stripe for a trainer with no subscription row", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never);
    mockFindSubscription.mockResolvedValue(null);

    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });

    expect(result).toEqual({ success: true });
    expect(mockCancelSubscription).not.toHaveBeenCalled();
  });

  it("does not look for a Stripe subscription when a client deletes", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(mockFindSubscription).not.toHaveBeenCalled();
    expect(mockCancelSubscription).not.toHaveBeenCalled();
  });
});
