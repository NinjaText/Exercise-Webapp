import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_t" })) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));
vi.mock("@/lib/services/audit-log.service", () => ({ logUserAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { completeClubTrainerOnboarding } from "../club-trainer-onboarding-actions";

const trainer = { id: "t1", role: "TRAINER", clerkOrgId: "org_club", onboarded: false };
const clubTrainerCaps = getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false });
const trainerOrgCaps = getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ userId: "clerk_t" } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any);
  vi.mocked(prisma.user.update).mockResolvedValue({ ...trainer, onboarded: true } as any);
  vi.mocked(getCapabilitiesForUser).mockResolvedValue(clubTrainerCaps);
});

describe("completeClubTrainerOnboarding", () => {
  it("sets the names, marks onboarded and audits", async () => {
    expect(await completeClubTrainerOnboarding({ firstName: " Tia ", lastName: " Coach " })).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { firstName: "Tia", lastName: "Coach", onboarded: true },
    });
    expect(logUserAudit).toHaveBeenCalled();
    const event = await vi.mocked(logUserAudit).mock.calls[0][1]();
    expect(event.action).toBe("CLUB_TRAINER_ONBOARDED");
  });

  it("requires both names", async () => {
    expect(await completeClubTrainerOnboarding({ firstName: "Tia", lastName: " " })).toEqual({
      ok: false,
      error: "Please enter your first and last name.",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses when signed out", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    expect((await completeClubTrainerOnboarding({ firstName: "A", lastName: "B" })).ok).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses a trainer-org trainer (regression: trainer orgs keep their own onboarding)", async () => {
    vi.mocked(getCapabilitiesForUser).mockResolvedValue(trainerOrgCaps);
    expect((await completeClubTrainerOnboarding({ firstName: "A", lastName: "B" })).ok).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses a club member", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...trainer, role: "CLIENT" } as any);
    expect((await completeClubTrainerOnboarding({ firstName: "A", lastName: "B" })).ok).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns a generic error when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("db down"));
    expect(await completeClubTrainerOnboarding({ firstName: "A", lastName: "B" })).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
  });
});
