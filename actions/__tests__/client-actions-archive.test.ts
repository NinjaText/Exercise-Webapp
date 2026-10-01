import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { update: vi.fn() } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/client.service", () => ({ getClientIdsForTrainer: vi.fn(async () => ["c1"]) }));
vi.mock("@/lib/services/audit-log.service", () => ({
  logAudit: vi.fn(),
  deriveActorType: vi.fn(() => "TRAINER"),
  diffFields: vi.fn(),
  AUDIT_ACTIONS: { USER_DEACTIVATED: "USER_DEACTIVATED", USER_REACTIVATED: "USER_REACTIVATED" },
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));
vi.mock("@/lib/services/coaching.service", () => ({ cancelCoachingForEndedMembership: vi.fn() }));

import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getOrgCapabilities, getUserCapabilities } from "@/lib/org-capabilities";
import { cancelCoachingForEndedMembership } from "@/lib/services/coaching.service";
import { archiveClientAction } from "../client-actions";

const trainer = { id: "t1", role: "TRAINER", clerkOrgId: "org_1", firstName: "T", lastName: "One" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(trainer as never);
  vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  vi.mocked(cancelCoachingForEndedMembership).mockReset().mockResolvedValue(undefined);
});

describe("archiveClientAction", () => {
  it("club trainer deactivating a member also ends their coaching", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false })
    );
    expect(await archiveClientAction("c1")).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { isActive: false } });
    expect(cancelCoachingForEndedMembership).toHaveBeenCalledWith("c1");
  });

  it("a coaching cancel failure is logged and the deactivation still succeeds", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(
      getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false })
    );
    vi.mocked(cancelCoachingForEndedMembership).mockRejectedValue(new Error("stripe down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await archiveClientAction("c1")).toEqual({ success: true });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("trainer-org deactivation never touches coaching (regression)", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(getOrgCapabilities(null));
    expect(await archiveClientAction("c1")).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { isActive: false } });
    expect(cancelCoachingForEndedMembership).not.toHaveBeenCalled();
  });

  it("refuses a client outside the trainer's roster", async () => {
    const res = await archiveClientAction("c_other");
    expect(res.success).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(cancelCoachingForEndedMembership).not.toHaveBeenCalled();
  });
});
