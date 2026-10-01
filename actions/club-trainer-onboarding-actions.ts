"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";

type Result = { ok: true } | { ok: false; error: string };

const NAME_MAX = 80;

/**
 * Minimal onboarding for an invited club trainer (D3): just their name. No
 * org is created and there is no trainer billing or trial.
 */
export async function completeClubTrainerOnboarding(input: { firstName: string; lastName: string }): Promise<Result> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please sign in again." };

  const firstName = input.firstName.trim().slice(0, NAME_MAX);
  const lastName = input.lastName.trim().slice(0, NAME_MAX);
  if (!firstName || !lastName) return { ok: false, error: "Please enter your first and last name." };

  try {
    const user = await prisma.user.findUnique({ where: { clerkId: userId } });
    // Only a TRAINER in a member-billed (club) org is a club trainer.
    if (!user || user.role !== "TRAINER" || (await getCapabilitiesForUser(user)).billing !== "member") {
      return { ok: false, error: "This account isn't a club trainer." };
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { firstName, lastName, onboarded: true },
    });
    await logUserAudit(updated, () => ({
      action: AUDIT_ACTIONS.CLUB_TRAINER_ONBOARDED,
      targetType: "User",
      targetId: updated.id,
      targetLabel: `${firstName} ${lastName}`,
      orgId: updated.clerkOrgId,
    }));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    console.error("Club trainer onboarding failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
