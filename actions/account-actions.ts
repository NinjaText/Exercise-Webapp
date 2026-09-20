"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
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
 * Self-serve account deletion (mobile spec §6; required by Apple 5.1.1(v)).
 * Order: DB data first, then the Clerk user. The Clerk `user.deleted`
 * webhook runs `deleteUserData` which is then a harmless no-op because the
 * local row is already gone.
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
