"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { DELETE_CONFIRMATION_PHRASE } from "@/lib/constants/account";
import {
  deleteUserData,
  findDeletionBlockers,
  type DeletionBlocker,
} from "@/lib/services/user-deletion.service";

export type DeleteOwnAccountResult =
  | { success: true }
  | { success: false; error: string; blockers?: DeletionBlocker[] };

/**
 * A cancel that fails because the subscription is already gone or already
 * cancelled has reached the state we wanted, so it counts as success.
 * Stripe reports a missing object as `resource_missing`; an already-cancelled
 * subscription comes back as an invalid-request whose message says so.
 */
function isAlreadyCancelled(error: unknown, subscriptionId: string): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "resource_missing") {
    // Stripe also returns `resource_missing` when the key or mode does not
    // match the object (test key against a live subscription, or the wrong
    // account), where the subscription is very much alive and still billing.
    // We cannot tell the two apart from the error alone, so we keep treating
    // it as cancelled but leave a trace to diagnose from.
    console.warn(
      `[account-deletion] Stripe returned resource_missing for subscription ${subscriptionId}; treating the cancel as already-cancelled. If the API key or mode is mismatched, this subscription may still be billing.`
    );
    return true;
  }
  const message = typeof e?.message === "string" ? e.message.toLowerCase() : "";
  return (
    message.includes("no such subscription") ||
    message.includes("already canceled") ||
    message.includes("already cancelled")
  );
}

/**
 * Stops the trainer's Stripe billing before their data is destroyed.
 *
 * `deleteUserData` removes the `TrainerSubscription` row, which is the only
 * place `stripeSubscriptionId` is stored — once it is gone there is no way
 * left to stop the charges, and the trainer has no billing-portal link
 * either. So this must run first, and a failure must abort the delete.
 */
async function cancelTrainerBilling(userId: string): Promise<void> {
  const subscription = await prisma.trainerSubscription.findUnique({
    where: { trainerId: userId },
    select: { stripeSubscriptionId: true },
  });
  if (!subscription?.stripeSubscriptionId) return;

  try {
    await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
  } catch (error) {
    if (isAlreadyCancelled(error, subscription.stripeSubscriptionId)) return;
    throw error;
  }
}

/**
 * Self-serve account deletion (mobile spec §6; required by Apple 5.1.1(v)).
 * Order: blockers, then Stripe cancellation, then DB data, then the Clerk
 * user. Billing must stop before the row holding the subscription id is
 * destroyed; a failed cancel aborts with nothing deleted, because still
 * charging someone whose account is already gone is far worse than a delete
 * they can retry. The Clerk `user.deleted` webhook runs `deleteUserData`
 * which is then a harmless no-op because the local row is already gone.
 */
export async function deleteOwnAccountAction(input: {
  confirmation: string;
}): Promise<DeleteOwnAccountResult> {
  const user = await getCurrentUser();

  if (input.confirmation.trim() !== DELETE_CONFIRMATION_PHRASE) {
    return { success: false, error: `Type ${DELETE_CONFIRMATION_PHRASE} to confirm.` };
  }

  const blockers = await findDeletionBlockers(user.id, {
    includeActiveClients: user.role === "TRAINER",
  });
  if (blockers.length > 0) {
    return { success: false, error: blockers[0].message, blockers };
  }

  if (user.role === "TRAINER") {
    try {
      await cancelTrainerBilling(user.id);
    } catch (error) {
      console.error("[account-deletion] stripe cancellation failed for", user.id, error);
      return {
        success: false,
        error:
          "We couldn't cancel your subscription with our payment provider, so nothing was deleted. Please try again or contact support.",
      };
    }
  }

  try {
    await deleteUserData(user.id);
  } catch (error) {
    console.error("[account-deletion] data removal failed for", user.id, error);
    return {
      success: false,
      error: "We couldn't delete your account right now. Please try again or contact support.",
    };
  }

  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(user.clerkId);
  } catch (error) {
    // The database row is already gone. If this Clerk user signs in again
    // they are treated as brand new and sent to onboarding; ops can remove
    // the Clerk record manually from the logged id.
    console.error("[account-deletion] clerk delete failed for", user.clerkId, error);
  }

  return { success: true };
}
