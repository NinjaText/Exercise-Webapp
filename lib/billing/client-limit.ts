import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgInvitations } from "@/lib/services/invitation.service";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { isBillingExempt } from "@/lib/billing/exempt";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";

export const UPGRADE_HREF = "/settings/billing";

export type ClientLimitCheck =
  | { ok: true; limit: number | null; used: number; remaining: number | null }
  | { ok: false; limit: number; used: number; remaining: number; plan: PlanTier; error: string; upgradeHref: string };

type Caller = Pick<User, "id" | "role" | "clerkOrgId" | "email" | "billingExemptAt">;

/**
 * Pure rule, kept separate for tests: can `adding` more clients fit?
 */
export function evaluateClientLimit(args: {
  plan: PlanTier;
  used: number;
  adding: number;
}): ClientLimitCheck {
  const { plan, used, adding } = args;
  const limit = TIER_CONFIG[plan].clientLimit;
  if (limit === null) return { ok: true, limit: null, used, remaining: null };
  const remaining = Math.max(0, limit - used);
  if (adding <= remaining) return { ok: true, limit, used, remaining };
  const label = TIER_CONFIG[plan].label;
  return {
    ok: false,
    limit,
    used,
    remaining,
    plan,
    upgradeHref: UPGRADE_HREF,
    error:
      `Your ${label} plan includes up to ${limit} active clients, and you have ${used} ` +
      `(including pending invitations). Upgrade your plan in Settings → Billing (${UPGRADE_HREF}) to add more.`,
  };
}

/**
 * Active clients in the org plus pending Clerk invitations — an accepted
 * invitation becomes a client, so pending ones count against the cap. A Clerk
 * failure listing invitations falls back to counting clients only.
 */
async function countClientSeats(clerkOrgId: string): Promise<number> {
  const clients = await prisma.user.count({
    where: { clerkOrgId, role: "CLIENT", NOT: { isActive: false } },
  });
  let pending = 0;
  try {
    const invitations = await getOrgInvitations(clerkOrgId);
    pending = invitations.filter((i) => i.status === "pending").length;
  } catch (err) {
    console.error("[client-limit] couldn't list invitations; counting clients only:", err);
  }
  return clients + pending;
}

/**
 * Server-side client cap for trainer orgs. Not limited: clubs (member-billed
 * orgs and their house coaches), billing-exempt accounts and super admins
 * (callers pass `isAdmin`). The plan comes from the caller's own
 * TrainerSubscription, else any trainer subscription in the same org; with
 * none, the Starter cap applies.
 */
export async function checkClientLimit(caller: Caller, adding = 1, opts: { isAdmin?: boolean } = {}): Promise<ClientLimitCheck> {
  const unlimited = (used = 0): ClientLimitCheck => ({ ok: true, limit: null, used, remaining: null });
  if (opts.isAdmin || isBillingExempt(caller) || !caller.clerkOrgId) return unlimited();
  const caps = await getCapabilitiesForUser(caller);
  if (caps.billing !== "trainer") return unlimited();

  const own = await prisma.trainerSubscription.findUnique({ where: { trainerId: caller.id }, select: { plan: true } });
  let plan: PlanTier | undefined = own?.plan;
  if (!plan) {
    const trainers = await prisma.user.findMany({
      where: { clerkOrgId: caller.clerkOrgId, role: "TRAINER" },
      select: { id: true, email: true, billingExemptAt: true },
    });
    // An exempt owner in the org means the org isn't capped.
    if (trainers.some((t) => isBillingExempt(t))) return unlimited();
    const orgSub = await prisma.trainerSubscription.findFirst({
      where: { trainerId: { in: trainers.map((t) => t.id) } },
      select: { plan: true },
    });
    plan = orgSub?.plan;
  }

  const used = await countClientSeats(caller.clerkOrgId);
  return evaluateClientLimit({ plan: plan ?? "STARTER", used, adding });
}
