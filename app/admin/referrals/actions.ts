"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/current-user";
import { logAudit, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { normalizeReferralCode, REFERRAL_CODE_RULES } from "@/lib/referrals/codes";
import {
  MAX_FIXED_CENTS,
  MAX_PERCENT_BP,
  MAX_RETENTION_COUNT,
  MAX_RETENTION_MONTHS,
  describeCommission,
  describeRetention,
} from "@/lib/referrals/terms";
import {
  ReferralAdminError,
  addAdjustment,
  createContractor,
  createPlan,
  deleteContractor,
  recordPayout,
  reversePayout,
  setPlanArchived,
  updateContractor,
  updatePlan,
  voidCommission,
} from "@/lib/referrals/admin";
import { sweepReferrals, type SweepResult } from "@/lib/referrals/sweep";
import type { User } from "@prisma/client";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

function actor(admin: User) {
  return {
    actorId: admin.id,
    actorType: "SUPER_ADMIN" as const,
    actorName: `${admin.firstName} ${admin.lastName}`.trim(),
  };
}

function revalidate(contractorId?: string) {
  revalidatePath("/admin/referrals", "layout");
  if (contractorId) revalidatePath(`/admin/referrals/${contractorId}`);
}

async function run<T>(label: string, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ReferralAdminError) return { ok: false, error: err.message };
    console.error(`[admin/referrals] ${label} failed:`, err);
    return { ok: false, error: `Could not ${label}. Please try again.` };
  }
}

// ── Plans ────────────────────────────────────────────────────────────────

const commissionType = z.enum(["NONE", "FIXED", "PERCENT"]);
const commissionValue = z.number().int().min(0);

const planSchema = z
  .object({
    name: z.string().trim().min(1, "Give the plan a name.").max(80),
    description: optionalText(500),
    trainerCommissionType: commissionType,
    trainerCommissionValue: commissionValue,
    individualCommissionType: commissionType,
    individualCommissionValue: commissionValue,
    retentionEnabled: z.boolean(),
    retentionBonusCents: z.number().int().min(0).max(MAX_FIXED_CENTS),
    retentionRequiredCount: z.number().int().min(0).max(MAX_RETENTION_COUNT),
    retentionMonths: z.number().int().min(0).max(MAX_RETENTION_MONTHS),
    retentionScope: z.enum(["TRAINERS", "INDIVIDUALS", "ALL"]),
  })
  .superRefine((p, ctx) => {
    for (const who of ["trainer", "individual"] as const) {
      const type = p[`${who}CommissionType`];
      const value = p[`${who}CommissionValue`];
      const max = type === "PERCENT" ? MAX_PERCENT_BP : MAX_FIXED_CENTS;
      if (type !== "NONE" && (value <= 0 || value > max)) {
        ctx.addIssue({ code: "custom", message: `Enter a valid ${who} commission.` });
      }
    }
    if (p.retentionEnabled && (p.retentionBonusCents <= 0 || p.retentionRequiredCount <= 0 || p.retentionMonths <= 0)) {
      ctx.addIssue({ code: "custom", message: "A retention bonus needs an amount, a subscriber count and a period." });
    }
  })
  .transform(({ retentionEnabled, ...p }) => ({
    ...p,
    trainerCommissionValue: p.trainerCommissionType === "NONE" ? 0 : p.trainerCommissionValue,
    individualCommissionValue: p.individualCommissionType === "NONE" ? 0 : p.individualCommissionValue,
    ...(retentionEnabled ? {} : { retentionBonusCents: 0, retentionRequiredCount: 0, retentionMonths: 0 }),
  }));

export type PlanFormInput = z.input<typeof planSchema>;

function planSummary(p: z.output<typeof planSchema>) {
  return {
    trainer: describeCommission(p.trainerCommissionType, p.trainerCommissionValue),
    individual: describeCommission(p.individualCommissionType, p.individualCommissionValue),
    retention: describeRetention(p),
  };
}

export async function savePlanAction(id: string | null, input: PlanFormInput): Promise<Result<{ id: string }>> {
  const admin = await requireSuperAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the plan fields." };
  if (id !== null && !objectId.safeParse(id).success) return { ok: false, error: "Plan not found." };

  return run("save the plan", async () => {
    const plan = id ? await updatePlan(id, parsed.data, admin.id) : await createPlan(parsed.data, admin.id);
    await logAudit({
      ...actor(admin),
      action: id ? AUDIT_ACTIONS.COMMISSION_PLAN_UPDATED : AUDIT_ACTIONS.COMMISSION_PLAN_CREATED,
      targetType: "CommissionPlan",
      targetId: plan.id,
      targetLabel: plan.name,
      metadata: planSummary(parsed.data),
    });
    revalidate();
    return { id: plan.id };
  });
}

export async function setPlanArchivedAction(id: string, archived: boolean): Promise<Result> {
  const admin = await requireSuperAdmin();
  if (!objectId.safeParse(id).success) return { ok: false, error: "Plan not found." };
  return run(archived ? "archive the plan" : "restore the plan", async () => {
    const plan = await setPlanArchived(id, archived, admin.id);
    await logAudit({
      ...actor(admin),
      action: archived ? AUDIT_ACTIONS.COMMISSION_PLAN_ARCHIVED : AUDIT_ACTIONS.COMMISSION_PLAN_UPDATED,
      targetType: "CommissionPlan",
      targetId: plan.id,
      targetLabel: plan.name,
      metadata: { archived },
    });
    revalidate();
    return undefined;
  });
}

// ── Contractors ──────────────────────────────────────────────────────────

const contractorSchema = z.object({
  name: z.string().trim().min(1, "Enter the contractor's name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  phone: optionalText(40),
  notes: optionalText(1000),
  referralCode: z
    .string()
    .transform((v, ctx) => {
      const code = normalizeReferralCode(v);
      if (!code) ctx.addIssue({ code: "custom", message: `Referral code: ${REFERRAL_CODE_RULES}` });
      return code ?? "";
    }),
  planId: objectId.nullable(),
  isActive: z.boolean(),
});

export type ContractorFormInput = z.input<typeof contractorSchema>;

export async function saveContractorAction(
  id: string | null,
  input: ContractorFormInput
): Promise<Result<{ id: string }>> {
  const admin = await requireSuperAdmin();
  const parsed = contractorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the contractor fields." };
  if (id !== null && !objectId.safeParse(id).success) return { ok: false, error: "Contractor not found." };

  return run("save the contractor", async () => {
    const c = id ? await updateContractor(id, parsed.data) : await createContractor(parsed.data);
    await logAudit({
      ...actor(admin),
      action: id ? AUDIT_ACTIONS.CONTRACTOR_UPDATED : AUDIT_ACTIONS.CONTRACTOR_CREATED,
      targetType: "Contractor",
      targetId: c.id,
      targetLabel: c.name,
      metadata: { referralCode: c.referralCode, planId: c.planId, isActive: c.isActive },
    });
    revalidate(c.id);
    return { id: c.id };
  });
}

export async function deleteContractorAction(id: string): Promise<Result> {
  const admin = await requireSuperAdmin();
  if (!objectId.safeParse(id).success) return { ok: false, error: "Contractor not found." };
  return run("delete the contractor", async () => {
    const c = await deleteContractor(id);
    await logAudit({
      ...actor(admin),
      action: AUDIT_ACTIONS.CONTRACTOR_DELETED,
      targetType: "Contractor",
      targetId: c.id,
      targetLabel: c.name,
    });
    revalidate();
    return undefined;
  });
}

// ── Commissions & payouts ────────────────────────────────────────────────

const voidSchema = z.object({ id: objectId, reason: z.string().trim().min(3, "Say why it's being voided.").max(300) });

export async function voidCommissionAction(input: z.input<typeof voidSchema>): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  return run("void the commission", async () => {
    const c = await voidCommission(parsed.data.id, parsed.data.reason);
    await logAudit({
      ...actor(admin),
      action: AUDIT_ACTIONS.COMMISSION_VOIDED,
      targetType: "Commission",
      targetId: c.id,
      targetLabel: c.description,
      metadata: { amountCents: c.amountCents, reason: parsed.data.reason },
    });
    revalidate(c.contractorId);
    return undefined;
  });
}

const adjustmentSchema = z.object({
  contractorId: objectId,
  amountCents: z.number().int().min(-MAX_FIXED_CENTS).max(MAX_FIXED_CENTS),
  description: z.string().trim().min(3, "Describe the adjustment.").max(200),
});

export async function addAdjustmentAction(input: z.input<typeof adjustmentSchema>): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid adjustment." };
  return run("add the adjustment", async () => {
    const c = await addAdjustment(parsed.data.contractorId, parsed.data.amountCents, parsed.data.description, admin.id);
    await logAudit({
      ...actor(admin),
      action: AUDIT_ACTIONS.COMMISSION_ADJUSTED,
      targetType: "Commission",
      targetId: c.id,
      targetLabel: c.description,
      metadata: { contractorId: c.contractorId, amountCents: c.amountCents },
    });
    revalidate(c.contractorId);
    return undefined;
  });
}

const payoutSchema = z.object({
  contractorId: objectId,
  commissionIds: z.array(objectId).min(1, "Select at least one commission.").max(500),
  method: z.string().trim().min(1, "Choose how it was paid.").max(60),
  reference: optionalText(120),
  note: optionalText(500),
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the payment date.")
    .transform((d) => new Date(`${d}T12:00:00.000Z`)),
});

export async function recordPayoutAction(input: z.input<typeof payoutSchema>): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the payout fields." };
  if (parsed.data.paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return { ok: false, error: "The payment date can't be in the future." };
  }
  return run("record the payout", async () => {
    const p = await recordPayout(parsed.data, admin.id);
    await logAudit({
      ...actor(admin),
      action: AUDIT_ACTIONS.PAYOUT_RECORDED,
      targetType: "Payout",
      targetId: p.id,
      targetLabel: `${(p.amountCents / 100).toFixed(2)} USD`,
      metadata: { contractorId: p.contractorId, amountCents: p.amountCents, method: p.method, commissions: p.commissionIds.length },
    });
    revalidate(p.contractorId);
    return undefined;
  });
}

export async function reversePayoutAction(id: string): Promise<Result> {
  const admin = await requireSuperAdmin();
  if (!objectId.safeParse(id).success) return { ok: false, error: "Payout not found." };
  return run("reverse the payout", async () => {
    const p = await reversePayout(id, admin.id);
    await logAudit({
      ...actor(admin),
      action: AUDIT_ACTIONS.PAYOUT_REVERSED,
      targetType: "Payout",
      targetId: p.id,
      targetLabel: `${(p.amountCents / 100).toFixed(2)} USD`,
      metadata: { contractorId: p.contractorId, amountCents: p.amountCents },
    });
    revalidate(p.contractorId);
    return undefined;
  });
}

// ── Recalculate ──────────────────────────────────────────────────────────

export async function runReferralSweepAction(): Promise<Result<SweepResult>> {
  await requireSuperAdmin();
  return run("recalculate", async () => {
    const result = await sweepReferrals();
    revalidate();
    return result;
  });
}
