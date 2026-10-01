import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const updateUser = vi.fn();
const getUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ users: { updateUser, getUser } })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: vi.fn(), findFirst: vi.fn() } },
}));

import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { syncMyClerkProfileAction, updateMyProfileAction } from "../profile-actions";

const mockUpdate = vi.mocked(prisma.user.update);
const mockFindFirst = vi.mocked(prisma.user.findFirst);
const me = { id: "u_1", clerkId: "clerk_1", email: "old@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(me as never);
  updateUser.mockResolvedValue({});
  mockFindFirst.mockResolvedValue(null);
});

describe("updateMyProfileAction", () => {
  it("writes the trimmed name to Clerk and the name + phone to the database", async () => {
    const result = await updateMyProfileAction({ firstName: " Ada ", lastName: "Lovelace", phone: " +1 (555) 010-0000 " });

    expect(result).toEqual({ success: true });
    expect(updateUser).toHaveBeenCalledWith("clerk_1", { firstName: "Ada", lastName: "Lovelace" });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { firstName: "Ada", lastName: "Lovelace", phone: "+1 (555) 010-0000" },
    });
  });

  it("stores a blank phone as null", async () => {
    await updateMyProfileAction({ firstName: "Ada", lastName: "Lovelace", phone: "  " });
    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({ phone: null });
  });

  it("rejects a blank first name with the field that failed, touching nothing", async () => {
    const result = await updateMyProfileAction({ firstName: "  ", lastName: "Lovelace", phone: "" });
    expect(result).toEqual({ success: false, error: "First name is required", field: "firstName" });
    expect(updateUser).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects letters in the phone number", async () => {
    const result = await updateMyProfileAction({ firstName: "Ada", lastName: "Lovelace", phone: "call me" });
    expect(result).toMatchObject({ success: false, field: "phone" });
  });

  it("does not write the database when Clerk fails, so the two never disagree", async () => {
    updateUser.mockRejectedValue(new Error("clerk down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await updateMyProfileAction({ firstName: "Ada", lastName: "Lovelace", phone: "" });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("syncMyClerkProfileAction", () => {
  const clerkUser = (overrides: Record<string, unknown> = {}) => ({
    hasImage: true,
    imageUrl: "https://img.clerk.com/me.png",
    primaryEmailAddressId: "e_2",
    emailAddresses: [
      { id: "e_1", emailAddress: "old@example.com" },
      { id: "e_2", emailAddress: "new@example.com" },
    ],
    ...overrides,
  });

  it("copies the photo and the PRIMARY email, not the first one listed", async () => {
    getUser.mockResolvedValue(clerkUser());
    const result = await syncMyClerkProfileAction();
    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { imageUrl: "https://img.clerk.com/me.png", email: "new@example.com" },
    });
  });

  it("clears the stored photo when the user removed theirs", async () => {
    getUser.mockResolvedValue(clerkUser({ hasImage: false, primaryEmailAddressId: "e_1" }));
    await syncMyClerkProfileAction();
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "u_1" }, data: { imageUrl: null } });
  });

  it("never takes an email another account already uses", async () => {
    getUser.mockResolvedValue(clerkUser());
    mockFindFirst.mockResolvedValue({ id: "someone_else" } as never);
    const result = await syncMyClerkProfileAction();
    expect(result.success).toBe(false);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty("email");
  });
});
