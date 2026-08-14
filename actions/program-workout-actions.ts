"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

export async function deleteWorkoutFromProgramAction(
  workoutId: string
): Promise<{ success: boolean; error?: string; data?: undefined }> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { program: { select: { id: true, trainerId: true } } },
    });

    if (!workout || workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    await prisma.workout.delete({ where: { id: workoutId } });

    revalidatePath(`/programs/${workout.program.id}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to delete workout:", error);
    return { success: false, error: "Failed to delete workout" };
  }
}

export async function duplicateWorkoutToDayAction(
  workoutId: string,
  weekIndex: number,
  dayIndex: number
): Promise<{ success: boolean; error?: string; data?: undefined }> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return { success: false, error: "Day must be within a single week (max 7 days)" };
  }
  if (!Number.isInteger(weekIndex) || weekIndex < 0) {
    return { success: false, error: "Invalid week" };
  }

  try {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        program: { select: { id: true, trainerId: true } },
        blocks: {
          orderBy: { orderIndex: "asc" },
          include: {
            exercises: {
              orderBy: { orderIndex: "asc" },
              include: { sets: { orderBy: { orderIndex: "asc" } } },
            },
          },
        },
      },
    });

    if (!workout || workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.workout.create as (args: any) => Promise<unknown>)({
      data: {
        programId: workout.programId,
        name: `${workout.name} (copy)`,
        weekIndex,
        dayIndex,
        orderIndex: weekIndex * 7 + dayIndex,
        estimatedMinutes: workout.estimatedMinutes,
        blocks: {
          create: workout.blocks.map((block) => ({
            name: block.name,
            type: block.type,
            orderIndex: block.orderIndex,
            rounds: block.rounds,
            restBetweenRounds: block.restBetweenRounds,
            timeCap: block.timeCap,
            notes: block.notes,
            exercises: {
              create: block.exercises.map((be) => ({
                exerciseId: be.exerciseId,
                orderIndex: be.orderIndex,
                restSeconds: be.restSeconds,
                notes: be.notes,
                supersetGroup: be.supersetGroup ?? null,
                sets: {
                  create: be.sets.map((s) => ({
                    orderIndex: s.orderIndex,
                    setType: s.setType,
                    targetReps: s.targetReps,
                    targetWeight: s.targetWeight,
                    targetDuration: s.targetDuration,
                    targetDistance:
                      (s as Record<string, unknown>).targetDistance ?? null,
                    targetRPE: (s as Record<string, unknown>).targetRPE ?? null,
                    targetPercentage1RM:
                      (s as Record<string, unknown>).targetPercentage1RM ??
                      null,
                    restAfter: (s as Record<string, unknown>).restAfter ?? null,
                    tempo: (s as Record<string, unknown>).tempo ?? null,
                  })),
                },
              })),
            },
          })),
        },
      },
    });

    revalidatePath(`/programs/${workout.program.id}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to duplicate workout:", error);
    return { success: false, error: "Failed to duplicate workout" };
  }
}
