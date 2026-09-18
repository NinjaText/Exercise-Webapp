import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/services/client.service", () => ({ getClientIdsForTrainer: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn() },
    clientProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/services/audit-log.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/audit-log.service")>();
  return { ...actual, logAudit: vi.fn() };
});

import { requireRole } from "@/lib/current-user";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import { logAudit, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { updateClientProfileAction } from "../client-actions";

const mockRequireRole = vi.mocked(requireRole);
const mockGetClientIds = vi.mocked(getClientIdsForTrainer);
const mockUserUpdate = vi.mocked(prisma.user.update);
const mockProfileFind = vi.mocked(prisma.clientProfile.findUnique);
const mockProfileUpsert = vi.mocked(prisma.clientProfile.upsert);
const mockLogAudit = vi.mocked(logAudit);

const trainer = {
  id: "trainer_1",
  firstName: "Jane",
  lastName: "Doe",
  role: "TRAINER",
  email: "jane@example.com",
  clerkOrgId: "org_1",
};

const validInput = {
  firstName: "Ray",
  lastName: "Humiston",
  primaryDiagnosis: "Rotator cuff tendinopathy",
  painScore: 4,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockResolvedValue(trainer as never);
  mockGetClientIds.mockResolvedValue(["client_1"]);
  mockProfileFind.mockResolvedValue(null as never);
  mockUserUpdate.mockResolvedValue({} as never);
  mockProfileUpsert.mockResolvedValue({} as never);
});

describe("updateClientProfileAction", () => {
  it("saves the intake record for a client on the trainer's roster", async () => {
    const result = await updateClientProfileAction("client_1", validInput);

    expect(result.success).toBe(true);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "client_1" },
        data: expect.objectContaining({ firstName: "Ray", lastName: "Humiston" }),
      })
    );
    expect(mockProfileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "client_1" },
        update: expect.objectContaining({ primaryDiagnosis: "Rotator cuff tendinopathy" }),
      })
    );
  });

  it("refuses a client who is not on the trainer's roster", async () => {
    mockGetClientIds.mockResolvedValue(["someone_else"]);

    const result = await updateClientProfileAction("client_1", validInput);

    expect(result.success).toBe(false);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockProfileUpsert).not.toHaveBeenCalled();
  });

  it("creates the profile row for a client who clicked through onboarding", async () => {
    mockProfileFind.mockResolvedValue(null as never);

    await updateClientProfileAction("client_1", validInput);

    const call = mockProfileUpsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
    };
    expect(call.create).toEqual(
      expect.objectContaining({
        userId: "client_1",
        primaryDiagnosis: "Rotator cuff tendinopathy",
      })
    );
  });

  it("writes an audit entry naming the client", async () => {
    await updateClientProfileAction("client_1", validInput);

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "trainer_1",
        action: AUDIT_ACTIONS.CLIENT_PROFILE_UPDATED,
        targetType: "ClientProfile",
        targetId: "client_1",
        targetLabel: "Ray Humiston",
      })
    );
  });

  it("rejects a pain score outside 0–10 before touching the database", async () => {
    const result = await updateClientProfileAction("client_1", {
      ...validInput,
      painScore: 12,
    });

    expect(result.success).toBe(false);
    expect(mockProfileUpsert).not.toHaveBeenCalled();
  });

  it("rejects an empty first name", async () => {
    const result = await updateClientProfileAction("client_1", {
      ...validInput,
      firstName: "   ",
    });

    expect(result.success).toBe(false);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("stores blank optional fields as null rather than empty strings", async () => {
    await updateClientProfileAction("client_1", {
      ...validInput,
      occupation: "",
      surgeryHistory: "   ",
    });

    const call = mockProfileUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(call.update.occupation).toBeNull();
    expect(call.update.surgeryHistory).toBeNull();
  });

  it("converts the injury date to a Date, since the column is a DateTime", async () => {
    await updateClientProfileAction("client_1", { ...validInput, injuryDate: "2026-03-14" });

    const call = mockProfileUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(call.update.injuryDate).toBeInstanceOf(Date);
  });

  it("leaves a blank injury date as null instead of an Invalid Date", async () => {
    await updateClientProfileAction("client_1", { ...validInput, injuryDate: "" });

    const call = mockProfileUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(call.update.injuryDate).toBeNull();
  });

  it("still reports success when the audit write fails", async () => {
    mockLogAudit.mockRejectedValue(new Error("audit down"));

    const result = await updateClientProfileAction("client_1", validInput);

    expect(result.success).toBe(true);
  });
});
