"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import * as workoutPlanService from "@/lib/services/workout-plan.service";
import * as aiService from "@/lib/services/ai.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import type { PlanStatus } from "@prisma/client";

export async function createPlanAction(input: {
  clientId?: string | null;
  title: string;
  description?: string;
  durationMinutes?: number;
  daysPerWeek?: number;
  exercises: {
    exerciseId: string;
    dayOfWeek?: number;
    orderIndex: number;
    sets: number;
    reps?: number;
    durationSeconds?: number;
    restSeconds?: number;
    notes?: string;
  }[];
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  if (input.clientId) {
    const clientIds = await getClientIdsForTrainer(dbUser.id);
    if (!clientIds.includes(input.clientId)) {
      return { success: false as const, error: "Forbidden" };
    }
  }

  try {
    const plan = await workoutPlanService.createPlan({
      ...input,
      createdById: dbUser.id,
    });

    revalidatePath("/workout-plans");
    return { success: true as const, data: plan };
  } catch (error) {
    console.error("Failed to create plan:", error);
    return { success: false as const, error: "Failed to create plan" };
  }
}

export async function generatePlanAction(input: {
  clientId?: string | null;
  focusAreas: string[];
  durationMinutes: number;
  daysPerWeek: number;
  difficultyLevel: string;
  additionalNotes?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  if (input.clientId) {
    const clientIds = await getClientIdsForTrainer(dbUser.id);
    if (!clientIds.includes(input.clientId)) {
      return { success: false as const, error: "Forbidden" };
    }
  }

  try {
    const generated = await aiService.generateWorkoutPlan(input);

    const plan = await workoutPlanService.createPlan({
      clientId: input.clientId,
      createdById: dbUser.id,
      title: generated.title,
      description: generated.description,
      durationMinutes: input.durationMinutes,
      daysPerWeek: input.daysPerWeek,
      aiGenerationParams: input as unknown as Record<string, unknown>,
      exercises: generated.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        dayOfWeek: e.dayOfWeek,
        orderIndex: e.orderIndex,
        sets: e.sets,
        reps: e.reps,
        durationSeconds: e.durationSeconds,
        restSeconds: e.restSeconds,
        notes: e.notes,
      })),
    });

    revalidatePath("/workout-plans");
    return { success: true as const, data: plan };
  } catch (error) {
    console.error("Failed to generate plan:", error);
    return { success: false as const, error: "Failed to generate plan. Please try again." };
  }
}

export async function updatePlanStatusAction(planId: string, status: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  // Verify the trainer owns this plan
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    select: { createdById: true },
  });
  if (!plan || plan.createdById !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await workoutPlanService.updatePlanStatus(planId, status as PlanStatus);
    revalidatePath("/workout-plans");
    revalidatePath(`/workout-plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to update plan status:", error);
    return { success: false as const, error: "Failed to update plan status" };
  }
}

export async function updatePlanExerciseAction(
  planExerciseId: string,
  data: {
    sets?: number;
    reps?: number;
    durationSeconds?: number;
    restSeconds?: number;
    notes?: string;
    isActive?: boolean;
    orderIndex?: number;
  }
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const planExercise = await prisma.planExercise.findUnique({
    where: { id: planExerciseId },
    select: { plan: { select: { createdById: true } } },
  });
  if (!planExercise || planExercise.plan.createdById !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await workoutPlanService.updatePlanExercise(planExerciseId, data);
    revalidatePath("/workout-plans");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to update plan exercise:", error);
    return { success: false as const, error: "Failed to update exercise" };
  }
}

export async function saveProgramBuilderBlocksAction(
  planId: string,
  blocks: {
    id?: string;
    name: string;
    description?: string;
    orderIndex: number;
    exercises: {
      id?: string;
      exerciseId: string;
      orderIndex: number;
      sets?: number;
      reps?: number;
      durationSeconds?: number;
      restSeconds?: number;
      notes?: string;
    }[];
  }[]
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  // Verify the trainer owns this plan
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    select: { createdById: true },
  });
  if (!plan || plan.createdById !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await workoutPlanService.updatePlanBlocks(planId, blocks);
    revalidatePath("/workout-plans");
    revalidatePath(`/workout-plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to save program blocks:", error);
    return { success: false as const, error: "Failed to save program blocks" };
  }
}


export async function swapExerciseAction(planExerciseId: string, newExerciseId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const planExercise = await prisma.planExercise.findUnique({
    where: { id: planExerciseId },
    select: { plan: { select: { createdById: true } } },
  });
  if (!planExercise || planExercise.plan.createdById !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await workoutPlanService.swapExercise(planExerciseId, newExerciseId);
    revalidatePath("/workout-plans");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to swap exercise:", error);
    return { success: false as const, error: "Failed to swap exercise" };
  }
}

export async function assignClientToPlanAction(planId: string, clientId: string | null) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId },
    select: { createdById: true },
  });
  if (!plan || plan.createdById !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  if (clientId) {
    const clientIds = await getClientIdsForTrainer(dbUser.id);
    if (!clientIds.includes(clientId)) {
      return { success: false as const, error: "Forbidden" };
    }
  }

  try {
    await prisma.workoutPlan.update({
      where: { id: planId },
      data: { clientId: clientId ?? null },
    });
    revalidatePath(`/workout-plans/${planId}`);
    revalidatePath("/workout-plans");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to assign client:", error);
    return { success: false as const, error: "Failed to assign client" };
  }
}
export async function saveAiTemplateAction(planData: any) {
  const user = await getCurrentUser();

  try {
    const plan = await prisma.workoutPlan.create({
      data: {
        title: planData.title,
        description: planData.description,
        daysPerWeek: planData.daysPerWeek,
        isTemplate: true,
        createdById: user.id,
        blocks: {
          create: planData.blocks.map((b: any, bIdx: number) => ({
            name: b.name,
            description: b.description,
            orderIndex: bIdx,
            exercises: {
              create: b.exercises.map((e: any, eIdx: number) => ({
                exerciseId: e.exerciseId,
                orderIndex: eIdx,
                sets: e.sets,
                reps: e.reps,
                durationSeconds: e.durationSeconds,
                restSeconds: e.restSeconds,
                notes: e.notes,
              }))
            }
          }))
        }
      }
    });

    revalidatePath('/workout-plans');
    return { success: true, data: plan };
  } catch (error: any) {
    console.error('saveAiTemplateAction Error:', error);
    return { success: false, error: error.message };
  }
}
