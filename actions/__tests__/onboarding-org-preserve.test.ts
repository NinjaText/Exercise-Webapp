import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { upsert: vi.fn(), findUnique: vi.fn() },
    clientProfile: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/services/audit-log.service", () => ({
  logUserAudit: vi.fn(),
  AUDIT_ACTIONS: {},
}));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { completeClientOnboarding } from "../onboarding-actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentUser).mockResolvedValue({
    emailAddresses: [{ emailAddress: "m@example.com" }],
    imageUrl: "",
  } as any);
  vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "u1" } as any);
  // Existing row: these tests cover the update branch.
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1" } as any);
});

describe("completeClientOnboarding org preservation", () => {
  it("does not touch clerkOrgId on update when the session has no active org", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "c1", orgId: null } as any);
    await completeClientOnboarding({ firstName: "A", lastName: "B" });
    const args = vi.mocked(prisma.user.upsert).mock.calls[0][0] as any;
    expect("clerkOrgId" in args.update).toBe(false);
  });

  it("sets clerkOrgId on update when the session has an active org", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "c1", orgId: "org_1" } as any);
    await completeClientOnboarding({ firstName: "A", lastName: "B" });
    const args = vi.mocked(prisma.user.upsert).mock.calls[0][0] as any;
    expect(args.update.clerkOrgId).toBe("org_1");
  });
});
