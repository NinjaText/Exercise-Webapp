"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Internal: authorization helpers
//
// These helpers centralize the "current user is a trainer AND owns the
// program that contains this block / block-exercise" check. Every mutating
// action below MUST run through one of these so we cannot accidentally let a
// trainer edit another trainer's program.
// ---------------------------------------------------------------------------

async function getTrainerAndVerifyBlockExercise(blockExerciseId: string) {
  const { userId } = await auth();
  if (!userId) return null;

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") return null;

  const be = await prisma.blockExerciseV2.findUnique({
    where: { id: blockExerciseId },
    include: {
      block: {
        include: {
          workout: {
            include: { program: { select: { id: true, trainerId: true } } },
          },
        },
      },
    },
  });
  if (!be || be.block.workout.program.trainerId !== dbUser.id) return null;

  return { dbUser, be, programId: be.block.workout.program.id };
}

async function getTrainerAndVerifyBlock(blockId: string) {
  const { userId } = await auth();
  if (!userId) return null;

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") return null;

  const block = await prisma.workoutBlockV2.findUnique({
    where: { id: blockId },
    include: {
      workout: {
        include: { program: { select: { id: true, trainerId: true } } },
      },
      exercises: { select: { id: true, orderIndex: true } },
    },
  });
  if (!block || block.workout.program.trainerId !== dbUser.id) return null;

  return { dbUser, block, programId: block.workout.program.id };
}

// ---------------------------------------------------------------------------
// Update prescription (sets / reps / duration / weight / notes / rest)
//
// We replace all sets for the BlockExercise rather than diffing — sets are
// thin rows and a clean replace keeps the action idempotent and predictable.
// All sets share the same prescription in the inline editor; advanced
// per-set editing lives in the dedicated set editor.
// ---------------------------------------------------------------------------

export async function updateExercisePrescriptionAction(
  blockExerciseId: string,
  data: {
    setCount: number;
    targetReps?: number | null;
    targetDuration?: number | null;
    targetWeight?: number | null;
    notes?: string | null;
    restSeconds?: number | null;
  }
) {
  const ctx = await getTrainerAndVerifyBlockExercise(blockExerciseId);
  if (!ctx) return { success: false as const, error: "Unauthorized" };

  // Clamp set count to a sane range to protect against accidental input
  const setCount = Math.max(1, Math.min(20, data.setCount));

  await prisma.$transaction(async (tx) => {
    await tx.blockExerciseV2.update({
      where: { id: blockExerciseId },
      data: {
        notes: data.notes ?? null,
        restSeconds: data.restSeconds || null,
      },
    });
    await tx.exerciseSet.deleteMany({ where: { blockExerciseId } });
    await tx.exerciseSet.createMany({
      data: Array.from({ length: setCount }).map((_, i) => ({
        blockExerciseId,
        orderIndex: i,
        setType: "NORMAL",
        targetReps: data.targetReps || null,
        targetDuration: data.targetDuration || null,
        targetWeight: data.targetWeight || null,
      })),
    });
  });

  revalidatePath(`/programs/${ctx.programId}`);
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Remove a BlockExercise (and cascade-delete its sets via FK), then
// re-index siblings so orderIndex stays contiguous 0..n-1.
// ---------------------------------------------------------------------------

export async function removeBlockExerciseAction(blockExerciseId: string) {
  const ctx = await getTrainerAndVerifyBlockExercise(blockExerciseId);
  if (!ctx) return { success: false as const, error: "Unauthorized" };

  const blockId = ctx.be.blockId;

  await prisma.blockExerciseV2.delete({ where: { id: blockExerciseId } });

  // Re-index remaining exercises to keep order contiguous
  const remaining = await prisma.blockExerciseV2.findMany({
    where: { blockId },
    orderBy: { orderIndex: "asc" },
  });
  await Promise.all(
    remaining.map((e, i) =>
      prisma.blockExerciseV2.update({
        where: { id: e.id },
        data: { orderIndex: i },
      })
    )
  );

  revalidatePath(`/programs/${ctx.programId}`);
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Append a new BlockExercise to a block with an initial prescription.
// The new exercise is appended (orderIndex = current count).
// ---------------------------------------------------------------------------

export async function addExerciseToBlockAction(
  blockId: string,
  exerciseId: string,
  prescription: {
    setCount: number;
    targetReps?: number | null;
    targetDuration?: number | null;
    targetWeight?: number | null;
  }
) {
  const ctx = await getTrainerAndVerifyBlock(blockId);
  if (!ctx) return { success: false as const, error: "Unauthorized" };

  const nextOrderIndex = ctx.block.exercises.length;
  const setCount = Math.max(1, prescription.setCount);

  const newBE = await prisma.$transaction(async (tx) => {
    const be = await tx.blockExerciseV2.create({
      data: { blockId, exerciseId, orderIndex: nextOrderIndex },
    });
    await tx.exerciseSet.createMany({
      data: Array.from({ length: setCount }).map((_, i) => ({
        blockExerciseId: be.id,
        orderIndex: i,
        setType: "NORMAL",
        targetReps: prescription.targetReps || null,
        targetDuration: prescription.targetDuration || null,
        targetWeight: prescription.targetWeight || null,
      })),
    });
    return be;
  });

  revalidatePath(`/programs/${ctx.programId}`);
  return { success: true as const, blockExerciseId: newBE.id };
}

// ---------------------------------------------------------------------------
// Move a workout to a different day/week within its program (structural mode
// drag-and-drop). Only the owning trainer may do this.
// ---------------------------------------------------------------------------

export async function moveWorkoutAction(
  workoutId: string,
  newDayIndex: number,
  newWeekIndex: number
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER")
    return { success: false as const, error: "Unauthorized" };

  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { program: { select: { id: true, trainerId: true } } },
  });
  if (!workout || workout.program.trainerId !== dbUser.id)
    return { success: false as const, error: "Unauthorized" };

  await prisma.workout.update({
    where: { id: workoutId },
    data: {
      dayIndex: newDayIndex,
      weekIndex: newWeekIndex,
      orderIndex: newWeekIndex * 7 + newDayIndex,
    },
  });

  revalidatePath(`/programs/${workout.program.id}`);
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Read-only: fetch active exercise library for the picker dialog.
// Returns only the fields the picker / inline panel need so payload stays
// small.
// ---------------------------------------------------------------------------

export async function getExercisesForPickerAction() {
  const { userId } = await auth();
  if (!userId) {
    return { success: false as const, error: "Unauthorized", data: [] };
  }

  const exercises = await prisma.exercise.findMany({
    where: { isActive: true, isAssessment: false },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      exercisePhases: true,
      defaultReps: true,
      defaultSets: true,
      defaultHoldSeconds: true,
      musclesTargeted: true,
      description: true,
      videoUrl: true,
      videoProvider: true,
    },
    orderBy: { name: "asc" },
  });

  return { success: true as const, data: exercises };
}
