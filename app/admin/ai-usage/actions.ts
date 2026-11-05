"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/services/audit-log.service";
import { MAX_TOKEN_SETTING } from "@/lib/ai/usage/config";
import { grantBonusTokens, setTierAllowance, setUsageOverride } from "@/lib/ai/usage/admin";

type Result = { ok: true } | { ok: false; error: string };

const tokens = z.number().int().min(0).max(MAX_TOKEN_SETTING);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

const tierSchema = z.object({ tier: z.enum(["STARTER", "PRO", "UNLIMITED"]), monthlyTokens: tokens });
const overrideSchema = z.object({
  userId: objectId,
  customMonthlyTokens: tokens.nullable(),
  unlimited: z.boolean(),
  note: z.string().trim().max(500).nullable(),
});
const bonusSchema = z.object({ userId: objectId, tokens: tokens.min(1) });

function adminActor(admin: { id: string; firstName: string; lastName: string }) {
  return { actorId: admin.id, actorType: "SUPER_ADMIN" as const, actorName: `${admin.firstName} ${admin.lastName}`.trim() };
}

async function trainerLabel(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
  return u?.role === "TRAINER" ? u.email : null;
}

export async function setTierAllowanceAction(input: z.infer<typeof tierSchema>): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a whole number of tokens (0 – 2,000,000,000)." };
  try {
    await setTierAllowance(parsed.data.tier, parsed.data.monthlyTokens, admin.id);
    await logAudit({
      ...adminActor(admin),
      action: "AI_ALLOWANCE_TIER_SET",
      targetType: "PlanTier",
      targetId: parsed.data.tier,
      targetLabel: parsed.data.tier,
      metadata: { monthlyTokens: parsed.data.monthlyTokens },
    });
    revalidatePath("/admin/ai-usage");
    return { ok: true };
  } catch (err) {
    console.error("setTierAllowanceAction failed:", err);
    return { ok: false, error: "Could not save the allowance." };
  }
}

export async function setUsageOverrideAction(input: z.infer<typeof overrideSchema>): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the custom limit (whole number, 0 – 2,000,000,000)." };
  try {
    const label = await trainerLabel(parsed.data.userId);
    if (!label) return { ok: false, error: "Trainer not found." };
    const { userId, ...rest } = parsed.data;
    await setUsageOverride(userId, { ...rest, note: rest.note || null }, admin.id);
    await logAudit({
      ...adminActor(admin),
      action: "AI_ALLOWANCE_OVERRIDE_SET",
      targetType: "User",
      targetId: userId,
      targetLabel: label,
      metadata: { customMonthlyTokens: rest.customMonthlyTokens, unlimited: rest.unlimited },
    });
    revalidatePath("/admin/ai-usage");
    return { ok: true };
  } catch (err) {
    console.error("setUsageOverrideAction failed:", err);
    return { ok: false, error: "Could not save the override." };
  }
}

export async function grantBonusTokensAction(input: z.infer<typeof bonusSchema>): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = bonusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a positive whole number of tokens." };
  try {
    const label = await trainerLabel(parsed.data.userId);
    if (!label) return { ok: false, error: "Trainer not found." };
    const window = await grantBonusTokens(parsed.data.userId, parsed.data.tokens);
    await logAudit({
      ...adminActor(admin),
      action: "AI_ALLOWANCE_BONUS_GRANTED",
      targetType: "User",
      targetId: parsed.data.userId,
      targetLabel: label,
      metadata: { tokens: parsed.data.tokens, periodStart: window.start.toISOString(), periodEnd: window.end.toISOString() },
    });
    revalidatePath("/admin/ai-usage");
    return { ok: true };
  } catch (err) {
    console.error("grantBonusTokensAction failed:", err);
    return { ok: false, error: "Could not grant the bonus." };
  }
}
