"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createPendingAssignment } from "@/lib/services/pending-program-assignment.service";

const queuePendingProgramAssignmentSchema = z.object({
  invitedEmail: z.string().trim().min(1, "An email is required").email("Enter a valid email"),
  programId: z.string().min(1, "A program is required"),
  startDate: z.string().nullish(),
});

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

/**
 * Queues a program to be assigned to an invited client once they accept their
 * invitation and their `User` row is created by the Clerk webhook.
 *
 * `trainerId` is deliberately NOT taken from the caller — it's resolved from
 * the authenticated session, so a client-supplied id can't queue work on
 * another trainer's behalf.
 */
export async function queuePendingProgramAssignmentAction(input: {
  invitedEmail: string;
  programId: string;
  startDate?: string | null;
}) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const parsed = queuePendingProgramAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const program = await prisma.program.findUnique({
    where: { id: parsed.data.programId },
    select: { trainerId: true },
  });
  if (!program || program.trainerId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await createPendingAssignment(
      user.id,
      parsed.data.invitedEmail,
      parsed.data.programId,
      parsed.data.startDate ? new Date(parsed.data.startDate) : null
    );
    revalidatePath("/clients");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to queue pending program assignment:", error);
    return { success: false as const, error: "Failed to queue the program assignment" };
  }
}
