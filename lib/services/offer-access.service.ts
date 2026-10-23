import { prisma } from "@/lib/prisma";
import { assignOnDemandProgram, assignProgram, duplicateProgram } from "@/lib/services/program.service";
import { utcToday } from "@/lib/utils/calendar-date";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

/**
 * Program access for paid offers (spec §3 "Access"), shared by one-time
 * purchases and coaching memberships. Mirrors the self-serve funnel: clone
 * the trainer's template, then assign the copy to the buyer.
 *
 * Concurrency: two deliveries (webhook + retry cron, or two webhook events
 * for one subscription) may race. The copy is only assigned after `claim`
 * wins a conditional write that records its id on the purchase/subscription
 * row; the loser archives its unused copy so it never shows in the library.
 */

export interface GrantProgramAccessInput {
  templateId: string;
  trainerId: string;
  clientId: string;
  /** The program already recorded on the row from an earlier run, if any. */
  currentProgramId: string | null;
  /** Conditionally records `programId` on the row; true only if this run won. */
  claim: (programId: string) => Promise<boolean>;
}

/** Assigns a copy that was claimed but never assigned (a run that crashed mid-way). */
async function finishAssignment(programId: string, clientId: string): Promise<void> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, clientId: true, schedulingType: true },
  });
  // Deleted by the trainer since: their call, don't recreate it.
  if (!program || program.clientId === clientId) return;
  if (program.clientId) throw new Error(`Program ${programId} is assigned to someone else`);
  if (getProgramSchedulingType(program) === "ON_DEMAND") await assignOnDemandProgram(programId, clientId);
  else await assignProgram(programId, clientId, utcToday());
}

/**
 * Ensures the client has their copy of the template. Idempotent. Returns
 * the assigned program id, or null when a concurrent run won the claim (that
 * run assigns it).
 */
export async function grantProgramAccess(input: GrantProgramAccessInput): Promise<string | null> {
  if (input.currentProgramId) {
    await finishAssignment(input.currentProgramId, input.clientId);
    return input.currentProgramId;
  }

  const template = await prisma.program.findUnique({
    where: { id: input.templateId },
    select: { id: true, name: true, schedulingType: true },
  });
  if (!template) throw new Error(`Program template ${input.templateId} not found`);

  const copy = await duplicateProgram(template.id, input.trainerId, false);
  const won = await input.claim(copy.id);
  if (!won) {
    await prisma.program.update({ where: { id: copy.id }, data: { status: "ARCHIVED" } });
    return null;
  }

  // duplicateProgram names it "<name> (Copy)"; the buyer should see the name they paid for.
  await prisma.program.update({ where: { id: copy.id }, data: { name: template.name } });
  if (getProgramSchedulingType(template) === "ON_DEMAND") await assignOnDemandProgram(copy.id, input.clientId);
  else await assignProgram(copy.id, input.clientId, utcToday());
  return copy.id;
}

/** Refund or cancellation: the client keeps their history but the program stops. */
export async function pauseProgramAccess(programId: string | null): Promise<void> {
  if (!programId) return;
  await prisma.program.updateMany({ where: { id: programId, status: "ACTIVE" }, data: { status: "PAUSED" } });
}

/** A membership that was PAUSED (Stripe stopped collecting) is active again. */
export async function resumeProgramAccess(programId: string | null): Promise<void> {
  if (!programId) return;
  await prisma.program.updateMany({ where: { id: programId, status: "PAUSED" }, data: { status: "ACTIVE" } });
}
