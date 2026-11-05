import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, trainerSubscription: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/org-capabilities.server", () => ({ getCapabilitiesForUser: vi.fn() }));
vi.mock("@/lib/services/stripe-billing.service", () => ({
  createTrainerCheckoutSession: vi.fn(),
  hasLiveTrainerSubscription: (s: { stripeSubscriptionId: string | null; status: string }) =>
    Boolean(s.stripeSubscriptionId) && s.status !== "CANCELED",
}));
vi.mock("@/lib/services/club.service", () => ({ getClubBySlug: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getUserCapabilities } from "@/lib/org-capabilities";
import { createTrainerCheckoutSession } from "@/lib/services/stripe-billing.service";
import { getClubBySlug } from "@/lib/services/club.service";
import { GET as startTrainer } from "../trainer/route";
import { GET as startIndividual } from "../individual/route";

const req = (path: string) => new NextRequest(`http://app.test${path}`);
const location = (res: Response) => new URL(res.headers.get("location")!).toString().replace("http://app.test", "");
const trainer = { id: "t1", role: "TRAINER", clerkOrgId: "org_t", onboarded: true, email: "coach@x.com" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INDIVIDUALS_CLUB_SLUG;
  vi.mocked(getCapabilitiesForUser).mockResolvedValue(
    getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false })
  );
});

describe("/start/trainer", () => {
  it("signed out → sign-up, remembering a valid plan in a cookie", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    const res = await startTrainer(req("/start/trainer?plan=pro"));
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/sign-up");
    expect(res.cookies.get("mia_start_plan")?.value).toBe("PRO");
  });

  it("ignores an invalid plan", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    const res = await startTrainer(req("/start/trainer?plan=GOLD"));
    expect(location(res)).toBe("/sign-up");
    expect(res.cookies.get("mia_start_plan")?.value ?? "").toBe("");
  });

  it("signed in but not onboarded → /onboarding with the plan", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await startTrainer(req("/start/trainer?plan=STARTER"));
    expect(location(res)).toBe("/onboarding");
    expect(res.cookies.get("mia_start_plan")?.value).toBe("STARTER");
  });

  it("onboarded trainer without a subscription → straight to Stripe Checkout", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any);
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ stripeSubscriptionId: null, status: "TRIALING" } as any);
    vi.mocked(createTrainerCheckoutSession).mockResolvedValue({ ok: true, url: "https://checkout.stripe.test/x" });
    const res = await startTrainer(req("/start/trainer?plan=UNLIMITED"));
    expect(createTrainerCheckoutSession).toHaveBeenCalledWith("t1", "UNLIMITED");
    expect(res.headers.get("location")).toBe("https://checkout.stripe.test/x");
  });

  it("already subscribed → settings, no second checkout", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any);
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ stripeSubscriptionId: "sub_1", status: "ACTIVE" } as any);
    const res = await startTrainer(req("/start/trainer?plan=PRO"));
    expect(location(res)).toBe("/settings/billing");
    expect(createTrainerCheckoutSession).not.toHaveBeenCalled();
  });

  it("no plan → the plan picker on /billing", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any);
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ stripeSubscriptionId: null, status: "TRIALING" } as any);
    expect(location(await startTrainer(req("/start/trainer")))).toBe("/billing");
  });

  it("checkout failure → /billing with the plan preselected", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any);
    vi.mocked(prisma.trainerSubscription.findUnique).mockResolvedValue({ stripeSubscriptionId: null, status: "TRIALING" } as any);
    vi.mocked(createTrainerCheckoutSession).mockRejectedValue(new Error("stripe down"));
    expect(location(await startTrainer(req("/start/trainer?plan=PRO")))).toBe("/billing?plan=PRO");
  });

  it("clients go to their dashboard", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...trainer, role: "CLIENT" } as any);
    expect(location(await startTrainer(req("/start/trainer?plan=PRO")))).toBe("/dashboard");
  });
});

describe("/start/individual", () => {
  it("falls back to pricing when INDIVIDUALS_CLUB_SLUG is unset", async () => {
    expect(location(await startIndividual(req("/start/individual")))).toBe("/pricing?tab=individuals&unavailable=individual");
  });

  it("falls back to pricing when the club doesn't exist", async () => {
    process.env.INDIVIDUALS_CLUB_SLUG = "mia-individuals";
    vi.mocked(getClubBySlug).mockResolvedValue(null);
    expect(location(await startIndividual(req("/start/individual")))).toBe("/pricing?tab=individuals&unavailable=individual");
  });

  it("signed out → the club's join page", async () => {
    process.env.INDIVIDUALS_CLUB_SLUG = "mia-individuals";
    vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_ind", joinSlug: "mia-individuals", openJoin: true } as any);
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    expect(location(await startIndividual(req("/start/individual")))).toBe("/join/mia-individuals");
  });

  it("signed in, open join → enroll directly", async () => {
    process.env.INDIVIDUALS_CLUB_SLUG = "mia-individuals";
    vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_ind", joinSlug: "mia-individuals", openJoin: true } as any);
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(location(await startIndividual(req("/start/individual")))).toBe("/join/mia-individuals/complete");
  });

  it("already a member → dashboard (the gate handles billing)", async () => {
    process.env.INDIVIDUALS_CLUB_SLUG = "mia-individuals";
    vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_ind", joinSlug: "mia-individuals", openJoin: true } as any);
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ clerkOrgId: "org_ind" } as any);
    expect(location(await startIndividual(req("/start/individual")))).toBe("/dashboard");
  });
});
