import type { PlanTier, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgType } from "@/lib/org-capabilities";
import { isBillingExempt } from "@/lib/billing/exempt";
import { computeCycleWindow, calendarMonthWindow, type CycleWindow } from "./cycle";
import { resolveAllowance, remainingTokens, isExhausted, type ResolvedAllowance } from "./allowance";
import { SYSTEM_ACCOUNT_KEY, type UnlimitedReason } from "./config";
import { AiUsageLimitError } from "./errors";

/**
 * Who an AI call is billed to. `accountKey` is the billed trainer's User id
 * (or "system"); `actorUserId` is whoever triggered it (may be a client).
 */
export interface AiAccount {
  accountKey: string;
  accountUserId: string | null;
  actorUserId: string | null;
  /** Set when the account is never blocked for a reason other than an override. */
  unlimitedReason: UnlimitedReason | null;
}

export interface AiUsageSnapshot {
  account: AiAccount;
  tier: PlanTier | null;
  window: CycleWindow;
  used: number;
  bonusTokens: number;
  allowance: ResolvedAllowance;
  remaining: number | null;
  exhausted: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string | null;
}

export const SYSTEM_ACCOUNT: AiAccount = {
  accountKey: SYSTEM_ACCOUNT_KEY,
  accountUserId: null,
  actorUserId: null,
  unlimitedReason: "system",
};

type ActorUser = {
  id: string;
  email: string;
  role: "TRAINER" | "CLIENT";
  clerkOrgId: string | null;
  billingExemptAt: Date | null;
};
const ACTOR_SELECT = { id: true, email: true, role: true, clerkOrgId: true, billingExemptAt: true } as const;

/**
 * Maps the user who triggered a call to the billed account:
 *  - a TRAINER bills themself;
 *  - a CLIENT bills their org's trainer (oldest TRAINER in the org; a club's house coach);
 *  - clubs (member-billed), billing-exempt trainers and super admins are unlimited;
 *  - a client with no trainer is tracked under themself, unlimited.
 */
export async function resolveAccountForUser(
  actor: ActorUser,
  opts: { superAdmin?: boolean } = {}
): Promise<AiAccount> {
  const org = actor.clerkOrgId
    ? await prisma.organization.findUnique({
        where: { clerkOrgId: actor.clerkOrgId },
        select: { type: true, houseCoachUserId: true },
      })
    : null;
  const isClub = getOrgType(org) === "CLUB";

  let trainer: { id: string; email: string; billingExemptAt: Date | null } | null = null;
  if (actor.role === "TRAINER") {
    trainer = actor;
  } else if (isClub && org?.houseCoachUserId) {
    trainer = { id: org.houseCoachUserId, email: "", billingExemptAt: null };
  } else if (actor.clerkOrgId) {
    trainer = await prisma.user.findFirst({
      where: { clerkOrgId: actor.clerkOrgId, role: "TRAINER" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, billingExemptAt: true },
    });
  }

  let unlimitedReason: UnlimitedReason | null = null;
  if (opts.superAdmin) unlimitedReason = "super_admin";
  else if (isClub) unlimitedReason = "club";
  else if (!trainer) unlimitedReason = "no_trainer";
  else if (isBillingExempt(trainer)) unlimitedReason = "billing_exempt";

  const accountUserId = trainer?.id ?? actor.id;
  return { accountKey: accountUserId, accountUserId, actorUserId: actor.id, unlimitedReason };
}

/**
 * Resolves the account from the current Clerk session. No session (cron,
 * webhooks, scripts, tests) → the system bucket. Clerk is imported lazily so
 * services stay importable outside Next.
 */
export async function resolveCurrentAiAccount(): Promise<AiAccount> {
  let clerkUserId: string | null = null;
  let superAdminClaim = false;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    clerkUserId = session.userId ?? null;
    const meta = session.sessionClaims?.publicMetadata as { superAdmin?: boolean } | undefined;
    superAdminClaim = meta?.superAdmin === true;
  } catch {
    return SYSTEM_ACCOUNT;
  }
  if (!clerkUserId) return SYSTEM_ACCOUNT;

  const actor = await prisma.user.findUnique({ where: { clerkId: clerkUserId }, select: ACTOR_SELECT });
  if (!actor) return SYSTEM_ACCOUNT;
  return resolveAccountForUser(actor, { superAdmin: superAdminClaim });
}

/** Resolves an explicit user id (e.g. a background job acting for a trainer). */
export async function resolveAiAccountForUserId(userId: string): Promise<AiAccount> {
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: ACTOR_SELECT });
  return actor ? resolveAccountForUser(actor) : SYSTEM_ACCOUNT;
}

export async function getTierAllowanceMap(): Promise<Partial<Record<PlanTier, number>>> {
  const rows = await prisma.aiTierAllowance.findMany({ select: { tier: true, monthlyTokens: true } });
  return Object.fromEntries(rows.map((r) => [r.tier, r.monthlyTokens]));
}

/** Current-cycle usage and allowance for an account. Read-only. */
export async function getUsageSnapshot(account: AiAccount, now: Date = new Date()): Promise<AiUsageSnapshot> {
  if (!account.accountUserId) {
    const window = calendarMonthWindow(now);
    const period = await findPeriod(account.accountKey, window.start);
    const allowance = resolveAllowance({ tier: "STARTER", unlimitedReason: "system" });
    return { account, tier: null, window, used: period?.totalTokens ?? 0, bonusTokens: 0, allowance, remaining: null, exhausted: false };
  }

  const [sub, override, tierAllowances] = await Promise.all([
    prisma.trainerSubscription.findUnique({
      where: { trainerId: account.accountUserId },
      select: { plan: true, currentPeriodEnd: true },
    }),
    prisma.aiUsageOverride.findUnique({
      where: { userId: account.accountUserId },
      select: { customMonthlyTokens: true, unlimited: true },
    }),
    getTierAllowanceMap(),
  ]);

  const tier: PlanTier = sub?.plan ?? "STARTER";
  const window = computeCycleWindow(sub, now);
  const period = await findPeriod(account.accountKey, window.start);
  const used = period?.totalTokens ?? 0;
  const bonusTokens = period?.bonusTokens ?? 0;
  const allowance = resolveAllowance({
    tier,
    tierAllowances,
    override,
    bonusTokens,
    unlimitedReason: account.unlimitedReason,
  });
  return {
    account,
    tier,
    window,
    used,
    bonusTokens,
    allowance,
    remaining: remainingTokens(allowance.total, used),
    exhausted: isExhausted(allowance.total, used),
  };
}

function findPeriod(accountKey: string, periodStart: Date) {
  return prisma.aiUsagePeriod.findUnique({
    where: { accountKey_periodStart: { accountKey, periodStart } },
    select: { totalTokens: true, bonusTokens: true },
  });
}

/** Throws AiUsageLimitError when the account's allowance is used up. */
export async function assertWithinAllowance(account: AiAccount, now: Date = new Date()): Promise<AiUsageSnapshot> {
  const snapshot = await getUsageSnapshot(account, now);
  if (snapshot.exhausted) {
    const onBehalfOfCoach = account.actorUserId !== null && account.actorUserId !== account.accountUserId;
    throw new AiUsageLimitError(snapshot.window.end, { onBehalfOfCoach });
  }
  return snapshot;
}

/**
 * Atomically increments the period counter (create-or-$inc). A concurrent
 * first write can lose the create race (P2002); the retry then updates.
 */
export async function incrementPeriod(
  accountKey: string,
  window: CycleWindow,
  inc: { promptTokens?: number; completionTokens?: number; totalTokens?: number; requestCount?: number; bonusTokens?: number }
): Promise<void> {
  const update: Prisma.AiUsagePeriodUpdateInput = {};
  for (const [key, value] of Object.entries(inc)) {
    if (value) (update as Record<string, unknown>)[key] = { increment: value };
  }
  const args = {
    where: { accountKey_periodStart: { accountKey, periodStart: window.start } },
    create: { accountKey, periodStart: window.start, periodEnd: window.end, ...inc },
    update,
  };
  try {
    await prisma.aiUsagePeriod.upsert(args);
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    await prisma.aiUsagePeriod.upsert(args);
  }
}

/** Records one call's tokens against the account (counter + event log). */
export async function recordUsage(
  account: AiAccount,
  window: CycleWindow,
  feature: string,
  usage: TokenUsage
): Promise<void> {
  await incrementPeriod(account.accountKey, window, {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    requestCount: 1,
  });
  await prisma.aiUsageEvent.create({
    data: {
      accountKey: account.accountKey,
      actorUserId: account.actorUserId,
      feature,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    },
  });
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/**
 * Reads token usage from either SDK's result:
 *  - OpenAI SDK chat completion: `usage.{prompt,completion,total}_tokens`, `model`
 *  - Vercel AI SDK (generateObject/generateText, v5+): `usage.{input,output,total}Tokens`, `response.modelId`
 * Returns null when the result carries no usage (e.g. a mocked call).
 */
export function extractTokenUsage(result: unknown): TokenUsage | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as {
    usage?: Record<string, unknown> | null;
    model?: unknown;
    response?: { modelId?: unknown } | null;
  };
  const u = r.usage;
  if (!u || typeof u !== "object") return null;

  const promptTokens = num(u.prompt_tokens ?? u.inputTokens ?? u.promptTokens);
  const completionTokens = num(u.completion_tokens ?? u.outputTokens ?? u.completionTokens);
  const totalTokens = num(u.total_tokens ?? u.totalTokens) || promptTokens + completionTokens;
  if (totalTokens === 0) return null;
  const model =
    typeof r.model === "string" ? r.model : typeof r.response?.modelId === "string" ? r.response.modelId : null;
  return { promptTokens, completionTokens, totalTokens, model };
}

export interface AiUsageSummary {
  used: number;
  /** null = unlimited. */
  allowance: number | null;
  remaining: number | null;
  bonusTokens: number;
  resetsAt: Date;
  unlimitedReason: UnlimitedReason | null;
}

/** Dashboard meter data for a signed-in trainer. Never throws (null on failure). */
export async function getAiUsageSummaryForTrainer(
  trainer: ActorUser,
  opts: { superAdmin?: boolean } = {}
): Promise<AiUsageSummary | null> {
  try {
    const snapshot = await getUsageSnapshot(await resolveAccountForUser(trainer, opts));
    return {
      used: snapshot.used,
      allowance: snapshot.allowance.total,
      remaining: snapshot.remaining,
      bonusTokens: snapshot.bonusTokens,
      resetsAt: snapshot.window.end,
      unlimitedReason: snapshot.allowance.unlimitedReason,
    };
  } catch (error) {
    console.error("[ai-usage] dashboard summary failed:", error);
    return null;
  }
}
