"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activeCallerOnly } from "@/lib/auth/active-user";
import { paymentsErrorMessage } from "@/lib/payments/connect-errors";
import { createOfferCheckout } from "@/lib/services/offer-checkout.service";
import { cancelOfferSubscription, resumeOfferSubscription } from "@/lib/services/offer-subscription.service";
import { offerIdSchema } from "@/lib/validators/paid-offer";

/**
 * Client store: checkout for a trainer's offer and membership self-service.
 * Authorization (own trainer only, chargeable account, no duplicate live
 * membership, own subscription only) lives in the services.
 */

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

async function getClient(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!user || user.role !== "CLIENT") return null;
  return user;
}

const UNAUTHORIZED = { success: false as const, error: "Unauthorized" };

export async function startOfferCheckoutAction(offerId: unknown): Promise<ActionResult<{ url: string }>> {
  const client = await getClient();
  if (!client) return UNAUTHORIZED;
  const parsed = offerIdSchema.safeParse(offerId);
  if (!parsed.success) return { success: false, error: "This offer is no longer available." };
  try {
    return { success: true, data: { url: await createOfferCheckout(client, parsed.data) } };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "start checkout") };
  }
}

export async function cancelOfferSubscriptionAction(subscriptionId: unknown): Promise<ActionResult> {
  const client = await getClient();
  if (!client) return UNAUTHORIZED;
  const parsed = offerIdSchema.safeParse(subscriptionId);
  if (!parsed.success) return { success: false, error: "Membership not found." };
  try {
    await cancelOfferSubscription(client, parsed.data);
    revalidatePath("/store");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "cancel membership") };
  }
}

export async function resumeOfferSubscriptionAction(subscriptionId: unknown): Promise<ActionResult> {
  const client = await getClient();
  if (!client) return UNAUTHORIZED;
  const parsed = offerIdSchema.safeParse(subscriptionId);
  if (!parsed.success) return { success: false, error: "Membership not found." };
  try {
    await resumeOfferSubscription(client, parsed.data);
    revalidatePath("/store");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: paymentsErrorMessage(err, "resume membership") };
  }
}
