"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activeCallerOnly } from "@/lib/auth/active-user";
import { paymentsErrorMessage } from "@/lib/payments/connect-errors";
import {
  disconnectConnectedAccount,
  getConnectOAuthUrl,
  startConnectOnboarding,
} from "@/lib/services/connected-account.service";
import { archiveOffer, createOffer, updateOffer } from "@/lib/services/paid-offer.service";
import { createOfferSchema, offerIdSchema, updateOfferSchema } from "@/lib/validators/paid-offer";

/**
 * Trainer payments (Stripe Connect): connect/onboard, disconnect, and
 * manage offers. Every service call re-checks the role and that the org
 * is a trainer org (clubs never get payments).
 */

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

async function getTrainer(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!user || user.role !== "TRAINER") return null;
  return user;
}

const UNAUTHORIZED = { success: false as const, error: "Unauthorized" };

export async function startConnectOnboardingAction(): Promise<ActionResult<{ url: string }>> {
  const trainer = await getTrainer();
  if (!trainer) return UNAUTHORIZED;
  try {
    return { success: true, data: { url: await startConnectOnboarding(trainer) } };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "start onboarding") };
  }
}

export async function startConnectOAuthAction(): Promise<ActionResult<{ url: string }>> {
  const trainer = await getTrainer();
  if (!trainer) return UNAUTHORIZED;
  try {
    return { success: true, data: { url: await getConnectOAuthUrl(trainer) } };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "start OAuth") };
  }
}

export async function disconnectConnectedAccountAction(): Promise<ActionResult> {
  const trainer = await getTrainer();
  if (!trainer) return UNAUTHORIZED;
  try {
    await disconnectConnectedAccount(trainer);
    revalidatePath("/payments");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "disconnect account") };
  }
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Some of the details are invalid.";
}

export async function createOfferAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const trainer = await getTrainer();
  if (!trainer) return UNAUTHORIZED;
  const parsed = createOfferSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
  try {
    const offer = await createOffer(trainer, parsed.data);
    revalidatePath("/payments");
    return { success: true, data: { id: offer.id } };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "create offer") };
  }
}

export async function updateOfferAction(input: unknown): Promise<ActionResult> {
  const trainer = await getTrainer();
  if (!trainer) return UNAUTHORIZED;
  const parsed = updateOfferSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
  try {
    await updateOffer(trainer, parsed.data);
    revalidatePath("/payments");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "update offer") };
  }
}

export async function archiveOfferAction(offerId: unknown): Promise<ActionResult> {
  const trainer = await getTrainer();
  if (!trainer) return UNAUTHORIZED;
  const parsed = offerIdSchema.safeParse(offerId);
  if (!parsed.success) return { success: false, error: "Offer not found." };
  try {
    await archiveOffer(trainer, parsed.data);
    revalidatePath("/payments");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "archive offer") };
  }
}
