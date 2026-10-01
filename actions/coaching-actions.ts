"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import {
  CoachingError,
  endCoaching,
  requestCoaching,
  respondToCoachingRequest,
  withdrawCoaching,
} from "@/lib/services/coaching.service";

export type CoachingActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

function failure(err: unknown, label: string): CoachingActionResult {
  if (err instanceof CoachingError) return { ok: false, error: err.message };
  console.error(`[coaching-actions] ${label} failed:`, err);
  return { ok: false, error: GENERIC_ERROR };
}

/** A club member asks for coaching. The service validates, notifies and audits. */
export async function requestCoachingAction(note: string): Promise<CoachingActionResult> {
  try {
    const user = await getCurrentUser();
    await requestCoaching(user, note);
    revalidatePath("/dashboard");
    revalidatePath("/billing");
    return { ok: true };
  } catch (err) {
    return failure(err, "request");
  }
}

/** A club member cancels their pending request or unpaid offer. */
export async function withdrawCoachingRequestAction(): Promise<CoachingActionResult> {
  try {
    const user = await getCurrentUser();
    await withdrawCoaching(user, user.id);
    revalidatePath("/dashboard");
    revalidatePath("/billing");
    return { ok: true };
  } catch (err) {
    return failure(err, "withdraw");
  }
}

const TRAINER_ONLY = "Only a club trainer can manage coaching.";

async function requireTrainer() {
  const user = await getCurrentUser();
  if (user.role !== "TRAINER") throw new CoachingError("forbidden", TRAINER_ONLY);
  return user;
}

function revalidateTrainerViews(memberId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  revalidatePath(`/clients/${memberId}`);
}

/** The club trainer accepts or declines a member's request. The service enforces same-org. */
export async function respondCoachingRequestAction(
  memberId: string,
  accept: boolean,
  note?: string
): Promise<CoachingActionResult> {
  try {
    const trainer = await requireTrainer();
    await respondToCoachingRequest(trainer, memberId, accept, note);
    revalidateTrainerViews(memberId);
    return { ok: true };
  } catch (err) {
    return failure(err, "respond");
  }
}

/** The club trainer ends an active coaching subscription (at period end). */
export async function endCoachingAction(memberId: string): Promise<CoachingActionResult> {
  try {
    const trainer = await requireTrainer();
    await endCoaching(trainer, memberId);
    revalidateTrainerViews(memberId);
    return { ok: true };
  } catch (err) {
    return failure(err, "end");
  }
}

/** The club trainer withdraws an offer the member hasn't paid for yet. */
export async function withdrawCoachingOfferAction(memberId: string): Promise<CoachingActionResult> {
  try {
    const trainer = await requireTrainer();
    await withdrawCoaching(trainer, memberId);
    revalidateTrainerViews(memberId);
    return { ok: true };
  } catch (err) {
    return failure(err, "withdraw offer");
  }
}
