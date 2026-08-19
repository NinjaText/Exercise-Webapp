"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as sessionService from "@/lib/services/session.service";

export async function rescheduleSessionAction(
  sessionId: string,
  newDate: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const existingSession = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId },
      select: { clientId: true, workout: { select: { program: { select: { trainerId: true } } } } },
    });
    if (!existingSession) return { success: false as const, error: "Session not found" };

    const isOwner =
      dbUser.role === "TRAINER"
        ? existingSession.workout.program.trainerId === dbUser.id
        : existingSession.clientId === dbUser.id;
    if (!isOwner) return { success: false as const, error: "Session not found" };

    const session = await sessionService.rescheduleSession(
      sessionId,
      new Date(newDate),
      dbUser.role === "TRAINER" ? "coach" : "client"
    );
    revalidatePath("/dashboard");
    revalidatePath("/programs");
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to reschedule session:", error);
    return { success: false as const, error: "Failed to reschedule session" };
  }
}

export async function getTrainerSessionsAction(
  from: string,
  to: string,
  clientId?: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER")
    return { success: false as const, error: "Unauthorized" };

  try {
    const sessions = await sessionService.getSessionsForTrainer(dbUser.id, {
      from: new Date(from),
      to: new Date(to),
      clientId,
    });
    return { success: true as const, data: sessions };
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return { success: false as const, error: "Failed to fetch sessions" };
  }
}

export async function getClientSessionsAction(from?: string, to?: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const sessions = await sessionService.getSessionsForClient(dbUser.id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { success: true as const, data: sessions };
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return { success: false as const, error: "Failed to fetch sessions" };
  }
}
