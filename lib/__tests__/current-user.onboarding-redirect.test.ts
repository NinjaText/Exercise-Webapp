import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_1", orgId: null })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() }, organization: { findUnique: vi.fn(), findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "../current-user";

const base = { id: "u1", isActive: true, onboarded: false };

beforeEach(() => vi.clearAllMocks());

describe("getCurrentUser un-onboarded redirects", () => {
  it("sends a not-yet-onboarded TRAINER in a member-billed org to /onboarding like any trainer", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...base, role: "TRAINER", clerkOrgId: "org_club" } as any);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_club", type: "CLUB" } as any);
    await expect(getCurrentUser()).rejects.toThrow(/^REDIRECT:\/onboarding$/);
  });

  it("keeps a trainer-org TRAINER on /onboarding (regression)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...base, role: "TRAINER", clerkOrgId: "org_t" } as any);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_t", type: null } as any);
    await expect(getCurrentUser()).rejects.toThrow(/^REDIRECT:\/onboarding$/);
  });

  it("keeps a TRAINER with no org on /onboarding without an org lookup", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...base, role: "TRAINER", clerkOrgId: null } as any);
    await expect(getCurrentUser()).rejects.toThrow(/^REDIRECT:\/onboarding$/);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it("keeps a CLIENT on /onboarding/client", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...base, role: "CLIENT", clerkOrgId: "org_club" } as any);
    await expect(getCurrentUser()).rejects.toThrow(/^REDIRECT:\/onboarding\/client$/);
  });
});
