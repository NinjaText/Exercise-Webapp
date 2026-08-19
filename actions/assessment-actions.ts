"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAssessmentSchema } from "@/lib/validators/assessment";
import * as outcomeService from "@/lib/services/outcome.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";

export async function createAssessmentAction(input: {
  clientId?: string;
  assessmentType: string;
  value: number;
  unit: string;
  notes?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  // Clients always record for themselves; trainers must supply a clientId
  if (dbUser.role === "TRAINER" && !input.clientId) {
    return { success: false as const, error: "Please select a client" };
  }
  if (dbUser.role === "TRAINER" && input.clientId) {
    const clientIds = await getClientIdsForTrainer(dbUser.id);
    if (!clientIds.includes(input.clientId)) {
      return { success: false as const, error: "Unauthorized" };
    }
  }
  const resolvedClientId =
    dbUser.role === "CLIENT" ? dbUser.id : (input.clientId ?? "");

  const parsed = createAssessmentSchema.safeParse({
    ...input,
    clientId: resolvedClientId,
  });
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const assessment = await outcomeService.recordAssessment({
      clientId: parsed.data.clientId,
      assessedById: dbUser.role === "TRAINER" ? dbUser.id : undefined,
      assessmentType: parsed.data.assessmentType,
      value: parsed.data.value,
      unit: parsed.data.unit,
      notes: parsed.data.notes,
    });

    revalidatePath("/assessments");
    return { success: true as const, data: assessment };
  } catch (error) {
    console.error("Failed to create assessment:", error);
    return { success: false as const, error: "Failed to record assessment" };
  }
}
