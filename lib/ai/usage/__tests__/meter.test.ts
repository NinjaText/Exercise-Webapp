import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { authMock, db } = vi.hoisted(() => ({
  authMock: vi.fn(),
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    trainerSubscription: { findUnique: vi.fn() },
    aiUsageOverride: { findUnique: vi.fn() },
    aiTierAllowance: { findMany: vi.fn() },
    aiUsagePeriod: { findUnique: vi.fn(), upsert: vi.fn() },
    aiUsageEvent: { create: vi.fn() },
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { meteredAiCall } from "../meter";
import { AiUsageLimitError, isAiUsageLimitError } from "../errors";
import { extractTokenUsage } from "../service";

const TRAINER = { id: "t1", email: "coach@example.com", role: "TRAINER", clerkOrgId: "org_t" };
const CLIENT = { id: "c1", email: "client@example.com", role: "CLIENT", clerkOrgId: "org_t" };
const openAiResponse = {
  model: "gpt-4o-2024-08-06",
  choices: [{ message: { content: "{}" } }],
  usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
};

function signIn(user: typeof TRAINER | null, superAdmin = false) {
  authMock.mockResolvedValue({
    userId: user ? `clerk_${user.id}` : null,
    sessionClaims: superAdmin ? { publicMetadata: { superAdmin: true } } : {},
  });
  db.user.findUnique.mockResolvedValue(user);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  db.organization.findUnique.mockResolvedValue({ type: null, houseCoachUserId: null });
  db.user.findFirst.mockResolvedValue({ id: TRAINER.id, email: TRAINER.email });
  db.trainerSubscription.findUnique.mockResolvedValue({ plan: "STARTER", currentPeriodEnd: new Date("2026-11-20T00:00:00Z") });
  db.aiUsageOverride.findUnique.mockResolvedValue(null);
  db.aiTierAllowance.findMany.mockResolvedValue([{ tier: "STARTER", monthlyTokens: 10_000 }]);
  db.aiUsagePeriod.findUnique.mockResolvedValue({ totalTokens: 2_000, bonusTokens: 0 });
  db.aiUsagePeriod.upsert.mockResolvedValue({});
  db.aiUsageEvent.create.mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.BILLING_EXEMPT_EMAILS;
});

describe("meteredAiCall", () => {
  it("records prompt+completion tokens from an OpenAI response against the trainer's Stripe cycle", async () => {
    signIn(TRAINER);
    const call = vi.fn().mockResolvedValue(openAiResponse);

    await expect(meteredAiCall("program.generate", call)).resolves.toBe(openAiResponse);

    expect(call).toHaveBeenCalledOnce();
    const upsert = db.aiUsagePeriod.upsert.mock.calls[0][0];
    expect(upsert.where.accountKey_periodStart).toEqual({ accountKey: "t1", periodStart: new Date("2026-10-20T00:00:00Z") });
    expect(upsert.create).toMatchObject({ promptTokens: 1200, completionTokens: 300, totalTokens: 1500, requestCount: 1, periodEnd: new Date("2026-11-20T00:00:00Z") });
    expect(upsert.update).toEqual({
      promptTokens: { increment: 1200 },
      completionTokens: { increment: 300 },
      totalTokens: { increment: 1500 },
      requestCount: { increment: 1 },
    });
    expect(db.aiUsageEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accountKey: "t1", actorUserId: "t1", feature: "program.generate", model: "gpt-4o-2024-08-06", totalTokens: 1500 }),
    });
  });

  it("refuses with a typed error when the allowance is exhausted, without calling the model", async () => {
    signIn(TRAINER);
    db.aiUsagePeriod.findUnique.mockResolvedValue({ totalTokens: 10_000, bonusTokens: 0 });
    const call = vi.fn();

    const err = (await meteredAiCall("program.generate", call).catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(AiUsageLimitError);
    expect(isAiUsageLimitError(err)).toBe(true);
    expect(err.message).toBe("You've used this month's AI allowance. Upgrade your plan or wait until November 20, 2026.");
    expect(call).not.toHaveBeenCalled();
    expect(db.aiUsagePeriod.upsert).not.toHaveBeenCalled();
  });

  it("bonus tokens and a custom override lift the limit", async () => {
    signIn(TRAINER);
    db.aiUsagePeriod.findUnique.mockResolvedValue({ totalTokens: 10_000, bonusTokens: 5_000 });
    await expect(meteredAiCall("x", async () => openAiResponse)).resolves.toBe(openAiResponse);

    db.aiUsagePeriod.findUnique.mockResolvedValue({ totalTokens: 10_000, bonusTokens: 0 });
    db.aiUsageOverride.findUnique.mockResolvedValue({ customMonthlyTokens: 50_000, unlimited: false });
    await expect(meteredAiCall("x", async () => openAiResponse)).resolves.toBe(openAiResponse);
  });

  it("bills a client's call to their org's trainer and words the error for the client", async () => {
    signIn(CLIENT as typeof TRAINER);
    db.user.findUnique.mockResolvedValue(CLIENT);
    await meteredAiCall("nutrition.photo", async () => ({ object: {}, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }));
    expect(db.aiUsagePeriod.upsert.mock.calls[0][0].create).toMatchObject({ accountKey: "t1", totalTokens: 15 });
    expect(db.aiUsageEvent.create.mock.calls[0][0].data).toMatchObject({ accountKey: "t1", actorUserId: "c1" });

    db.aiUsagePeriod.findUnique.mockResolvedValue({ totalTokens: 10_000, bonusTokens: 0 });
    const err = (await meteredAiCall("nutrition.photo", vi.fn()).catch((e) => e)) as Error;
    expect(err.message).toMatch(/your coach's monthly AI allowance is used up/);
  });

  it("billing-exempt trainers are unlimited but still tracked", async () => {
    process.env.BILLING_EXEMPT_EMAILS = "coach@example.com";
    signIn(TRAINER);
    db.aiUsagePeriod.findUnique.mockResolvedValue({ totalTokens: 99_999_999, bonusTokens: 0 });
    await expect(meteredAiCall("x", async () => openAiResponse)).resolves.toBe(openAiResponse);
    expect(db.aiUsagePeriod.upsert).toHaveBeenCalled();
  });

  it("club orgs (house coach) and super admins are unlimited but still tracked", async () => {
    db.aiUsagePeriod.findUnique.mockResolvedValue({ totalTokens: 99_999_999, bonusTokens: 0 });

    signIn(TRAINER);
    db.organization.findUnique.mockResolvedValue({ type: "CLUB", houseCoachUserId: "t1" });
    await expect(meteredAiCall("x", async () => openAiResponse)).resolves.toBe(openAiResponse);

    db.organization.findUnique.mockResolvedValue({ type: null, houseCoachUserId: null });
    signIn(TRAINER, true);
    await expect(meteredAiCall("x", async () => openAiResponse)).resolves.toBe(openAiResponse);
    expect(db.aiUsagePeriod.upsert).toHaveBeenCalledTimes(2);
  });

  it("no session → system bucket (calendar month), never blocked", async () => {
    signIn(null);
    await meteredAiCall("cron.job", async () => openAiResponse);
    expect(db.trainerSubscription.findUnique).not.toHaveBeenCalled();
    expect(db.aiUsagePeriod.upsert.mock.calls[0][0].create).toMatchObject({
      accountKey: "system",
      periodStart: new Date("2026-11-01T00:00:00Z"),
    });
  });

  it("is fail-open: a metering DB error never blocks or fails the AI call", async () => {
    signIn(TRAINER);
    db.aiTierAllowance.findMany.mockRejectedValue(new Error("db down"));
    db.aiUsagePeriod.upsert.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(meteredAiCall("x", async () => openAiResponse)).resolves.toBe(openAiResponse);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("retries the upsert once when a concurrent create wins the race", async () => {
    signIn(TRAINER);
    db.aiUsagePeriod.upsert.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    await meteredAiCall("x", async () => openAiResponse);
    expect(db.aiUsagePeriod.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("extractTokenUsage", () => {
  it("reads both SDK shapes and ignores results without usage", () => {
    expect(extractTokenUsage(openAiResponse)).toEqual({ promptTokens: 1200, completionTokens: 300, totalTokens: 1500, model: "gpt-4o-2024-08-06" });
    expect(
      extractTokenUsage({ usage: { inputTokens: 7, outputTokens: 3, totalTokens: undefined }, response: { modelId: "gpt-4o-mini" } })
    ).toEqual({ promptTokens: 7, completionTokens: 3, totalTokens: 10, model: "gpt-4o-mini" });
    expect(extractTokenUsage({ object: {} })).toBeNull();
    expect(extractTokenUsage("mock")).toBeNull();
  });
});
