import { listPlans } from "@/lib/referrals/admin";
import { describeCommission, describeRetention } from "@/lib/referrals/terms";
import type { PlanOption } from "./contractor-dialog";

/** Plans for the contractor dialog's picker, with a one-line summary each. */
export async function planOptions(): Promise<PlanOption[]> {
  const plans = await listPlans();
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    archived: Boolean(p.archivedAt),
    summary: [
      `Trainers: ${describeCommission(p.trainerCommissionType, p.trainerCommissionValue)}`,
      `Individuals: ${describeCommission(p.individualCommissionType, p.individualCommissionValue)}`,
      describeRetention(p),
    ].join(" · "),
  }));
}
