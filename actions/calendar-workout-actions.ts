"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

function revalidateClient(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Create ad-hoc workout on a specific date
// ---------------------------------------------------------------------------

export async function createAdHocWorkout(
  clientId: string,
  scheduledDate: string,
  workoutName: string
): Promise<ActionResult<{ sessionId: string; workoutId: string }>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  // Verify trainer has access to this client (same org)
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT", clerkOrgId: user.clerkOrgId ?? undefined },
    select: { id: true },
  });
  if (!user.clerkOrgId || !client) {
    return { success: false, error: "You do not have access to this client" };
  }

  try {
    // Create an ad-hoc program, workout, default block, and session in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const program = await tx.program.create({
        data: {
          name: workoutName,
          trainerId: user.id,
          clientId,
          isTemplate: false,
          status: "ACTIVE",
          tags: ["ad-hoc"],
        },
      });

      const workout = await tx.workout.create({
        data: {
          programId: program.id,
          name: workoutName,
          dayIndex: 0,
          weekIndex: 0,
          orderIndex: 0,
        },
      });

      await tx.workoutBlockV2.create({
        data: {
          workoutId: workout.id,
          name: "Workout",
          type: "NORMAL",
          orderIndex: 0,
          rounds: 1,
        },
      });

      const session = await tx.workoutSessionV2.create({
        data: {
          workoutId: workout.id,
          clientId,
          scheduledDate: new Date(scheduledDate),
          status: "SCHEDULED",
        },
      });

      return { sessionId: session.id, workoutId: workout.id };
    });

    revalidateClient(clientId);
    return { success: true, data: result };
  } catch (error) {
    console.error("Failed to create ad-hoc workout:", error);
    return { success: false, error: "Failed to create workout" };
  }
}

// ---------------------------------------------------------------------------
// Add block to a workout
// ---------------------------------------------------------------------------

export async function addBlockToWorkout(
  workoutId: string,
  blockData: { name?: string; type: string; orderIndex: number }
): Promise<ActionResult<{ id: string; name: string | null; type: string; orderIndex: number; rounds: number; timeCap: number | null; restBetweenRounds: number | null; notes: string | null }>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    // Verify ownership through workout -> program -> trainer
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { program: { select: { trainerId: true, clientId: true } } },
    });
    if (!workout || workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const block = await prisma.workoutBlockV2.create({
      data: {
        workoutId,
        name: blockData.name || null,
        type: blockData.type,
        orderIndex: blockData.orderIndex,
        rounds: 1,
      },
    });

    if (workout.program.clientId) revalidateClient(workout.program.clientId);
    return {
      success: true,
      data: {
        id: block.id,
        name: block.name,
        type: block.type,
        orderIndex: block.orderIndex,
        rounds: block.rounds,
        timeCap: block.timeCap,
        restBetweenRounds: block.restBetweenRounds,
        notes: block.notes,
      },
    };
  } catch (error) {
    console.error("Failed to add block:", error);
    return { success: false, error: "Failed to add block" };
  }
}

// ---------------------------------------------------------------------------
// Add exercise to a block
// ---------------------------------------------------------------------------

export async function addExerciseToBlock(
  blockId: string,
  exerciseId: string,
  defaultSets?: number,
  defaultReps?: number
): Promise<ActionResult<{
  id: string;
  orderIndex: number;
  restSeconds: number | null;
  notes: string | null;
  exercise: { id: string; name: string; imageUrl: string | null; videoUrl: string | null };
  sets: { id: string; orderIndex: number; setType: string; targetReps: number | null; targetWeight: number | null; targetDuration: number | null; targetRPE: number | null; restAfter: number | null }[];
}>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const block = await prisma.workoutBlockV2.findUnique({
      where: { id: blockId },
      include: {
        workout: { include: { program: { select: { trainerId: true, clientId: true } } } },
        exercises: { select: { orderIndex: true }, orderBy: { orderIndex: "desc" }, take: 1 },
      },
    });
    if (!block || block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const nextOrder = (block.exercises[0]?.orderIndex ?? -1) + 1;
    const numSets = defaultSets ?? 3;
    const reps = defaultReps ?? null;

    const blockExercise = await prisma.blockExerciseV2.create({
      data: {
        blockId,
        exerciseId,
        orderIndex: nextOrder,
        sets: {
          create: Array.from({ length: numSets }, (_, i) => ({
            orderIndex: i,
            setType: "NORMAL",
            targetReps: reps,
          })),
        },
      },
      include: {
        exercise: {
          select: { id: true, name: true, imageUrl: true, videoUrl: true },
        },
        sets: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (block.workout.program.clientId) revalidateClient(block.workout.program.clientId);
    return {
      success: true,
      data: {
        id: blockExercise.id,
        orderIndex: blockExercise.orderIndex,
        restSeconds: blockExercise.restSeconds,
        notes: blockExercise.notes,
        exercise: blockExercise.exercise,
        sets: blockExercise.sets.map((s) => ({
          id: s.id,
          orderIndex: s.orderIndex,
          setType: s.setType,
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetRPE: s.targetRPE,
          restAfter: s.restAfter,
        })),
      },
    };
  } catch (error) {
    console.error("Failed to add exercise:", error);
    return { success: false, error: "Failed to add exercise" };
  }
}

// ---------------------------------------------------------------------------
// Update a set
// ---------------------------------------------------------------------------

export async function updateSet(
  setId: string,
  data: {
    targetReps?: number | null;
    targetPercentage1RM?: number | null;
    tempo?: string | null;
    targetWeight?: number | null;
    targetDuration?: number | null;
    targetDurationUnit?: string | null;
    targetRPE?: number | null;
    restAfter?: number | null;
  }
): Promise<ActionResult<{ id: string }>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    // Verify ownership chain: set -> blockExercise -> block -> workout -> program
    const set = await prisma.exerciseSet.findUnique({
      where: { id: setId },
      include: {
        blockExercise: {
          include: {
            block: {
              include: {
                workout: {
                  include: { program: { select: { trainerId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!set || set.blockExercise.block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    await prisma.exerciseSet.update({
      where: { id: setId },
      data,
    });

    return { success: true, data: { id: setId } };
  } catch (error) {
    console.error("Failed to update set:", error);
    return { success: false, error: "Failed to update set" };
  }
}

// ---------------------------------------------------------------------------
// Add set to a block exercise
// ---------------------------------------------------------------------------

export async function addSetToExercise(
  blockExerciseId: string,
  orderIndex: number
): Promise<ActionResult<{
  id: string;
  orderIndex: number;
  setType: string;
  targetReps: number | null;
  targetWeight: number | null;
  targetDuration: number | null;
  targetDurationUnit: string | null;
  targetRPE: number | null;
  restAfter: number | null;
}>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const be = await prisma.blockExerciseV2.findUnique({
      where: { id: blockExerciseId },
      include: {
        block: {
          include: {
            workout: {
              include: { program: { select: { trainerId: true } } },
            },
          },
        },
      },
    });
    if (!be || be.block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const newSet = await prisma.exerciseSet.create({
      data: {
        blockExerciseId,
        orderIndex,
        setType: "NORMAL",
      },
    });

    return {
      success: true,
      data: {
        id: newSet.id,
        orderIndex: newSet.orderIndex,
        setType: newSet.setType,
        targetReps: newSet.targetReps,
        targetWeight: newSet.targetWeight,
        targetDuration: newSet.targetDuration,
        targetDurationUnit: newSet.targetDurationUnit,
        targetRPE: newSet.targetRPE,
        restAfter: newSet.restAfter,
      },
    };
  } catch (error) {
    console.error("Failed to add set:", error);
    return { success: false, error: "Failed to add set" };
  }
}

// ---------------------------------------------------------------------------
// Delete set
// ---------------------------------------------------------------------------

export async function deleteSet(setId: string): Promise<ActionResult<void>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const set = await prisma.exerciseSet.findUnique({
      where: { id: setId },
      include: {
        blockExercise: {
          include: {
            block: {
              include: {
                workout: {
                  include: { program: { select: { trainerId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!set || set.blockExercise.block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    await prisma.exerciseSet.delete({ where: { id: setId } });
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to delete set:", error);
    return { success: false, error: "Failed to delete set" };
  }
}

// ---------------------------------------------------------------------------
// Update block exercise
// ---------------------------------------------------------------------------

export async function updateBlockExercise(
  blockExerciseId: string,
  data: { notes?: string | null; orderIndex?: number }
): Promise<ActionResult<{ id: string; notes: string | null; orderIndex: number }>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const be = await prisma.blockExerciseV2.findUnique({
      where: { id: blockExerciseId },
      include: {
        block: {
          include: {
            workout: {
              include: { program: { select: { trainerId: true } } },
            },
          },
        },
      },
    });

    if (!be || be.block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const updated = await prisma.blockExerciseV2.update({
      where: { id: blockExerciseId },
      data,
      select: { id: true, notes: true, orderIndex: true },
    });

    return { success: true, data: updated };
  } catch (error) {
    console.error("Failed to update block exercise:", error);
    return { success: false, error: "Failed to update block exercise" };
  }
}

export async function reorderBlockExercises(
  blockId: string,
  updates: { id: string; orderIndex: number }[]
): Promise<ActionResult<void>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const block = await prisma.workoutBlockV2.findUnique({
      where: { id: blockId },
      include: {
        workout: {
          include: { program: { select: { trainerId: true } } },
        },
      },
    });

    if (!block || block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    // Do updates in a transaction
    await prisma.$transaction(
      updates.map(({ id, orderIndex }) =>
        prisma.blockExerciseV2.update({
          where: { id },
          data: { orderIndex },
        })
      )
    );

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to reorder block exercises:", error);
    return { success: false, error: "Failed to reorder block exercises" };
  }
}
// ---------------------------------------------------------------------------
// Delete block exercise
// ---------------------------------------------------------------------------

export async function deleteBlockExercise(
  blockExerciseId: string
): Promise<ActionResult<void>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const be = await prisma.blockExerciseV2.findUnique({
      where: { id: blockExerciseId },
      include: {
        block: {
          include: {
            workout: {
              include: { program: { select: { trainerId: true } } },
            },
          },
        },
      },
    });
    if (!be || be.block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    await prisma.blockExerciseV2.delete({ where: { id: blockExerciseId } });
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to delete exercise:", error);
    return { success: false, error: "Failed to delete exercise" };
  }
}

// ---------------------------------------------------------------------------
// Delete block
// ---------------------------------------------------------------------------

export async function deleteBlock(blockId: string): Promise<ActionResult<void>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const block = await prisma.workoutBlockV2.findUnique({
      where: { id: blockId },
      include: {
        workout: {
          include: { program: { select: { trainerId: true } } },
        },
      },
    });
    if (!block || block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    await prisma.workoutBlockV2.delete({ where: { id: blockId } });
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to delete block:", error);
    return { success: false, error: "Failed to delete block" };
  }
}

// ---------------------------------------------------------------------------
// Update workout name
// ---------------------------------------------------------------------------

export async function updateWorkoutName(
  workoutId: string,
  name: string
): Promise<ActionResult<void>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { program: { select: { trainerId: true, clientId: true } } },
    });
    if (!workout || workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    await prisma.workout.update({
      where: { id: workoutId },
      data: { name },
    });

    if (workout.program.clientId) revalidateClient(workout.program.clientId);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to update workout name:", error);
    return { success: false, error: "Failed to update workout name" };
  }
}

// ---------------------------------------------------------------------------
// Update block
// ---------------------------------------------------------------------------

export async function updateBlock(
  blockId: string,
  data: { name?: string | null; type?: string; rounds?: number; timeCap?: number | null; restBetweenRounds?: number | null }
): Promise<ActionResult<{ id: string; name: string | null; type: string; rounds: number; timeCap: number | null; restBetweenRounds: number | null }>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const block = await prisma.workoutBlockV2.findUnique({
      where: { id: blockId },
      include: {
        workout: {
          include: { program: { select: { trainerId: true } } },
        },
      },
    });
    if (!block || block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const updated = await prisma.workoutBlockV2.update({
      where: { id: blockId },
      data,
    });

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        rounds: updated.rounds,
        timeCap: updated.timeCap,
        restBetweenRounds: updated.restBetweenRounds,
      },
    };
  } catch (error) {
    console.error("Failed to update block:", error);
    return { success: false, error: "Failed to update block" };
  }
}

// ---------------------------------------------------------------------------
// Get full session with workout hierarchy (for the editor panel)
// ---------------------------------------------------------------------------

export async function getSessionWithWorkout(
  sessionId: string
): Promise<ActionResult<SessionWithFullWorkout>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId },
      include: {
        workout: {
          include: {
            blocks: {
              orderBy: { orderIndex: "asc" },
              include: {
                exercises: {
                  orderBy: { orderIndex: "asc" },
                  include: {
                    exercise: {
                      select: {
                        id: true,
                        name: true,
                        imageUrl: true,
                        videoUrl: true,
                      },
                    },
                    sets: { orderBy: { orderIndex: "asc" } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) return { success: false, error: "Session not found" };

    // Verify the trainer owns the program
    const workout = await prisma.workout.findUnique({
      where: { id: session.workoutId },
      include: { program: { select: { trainerId: true } } },
    });
    if (!workout || workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    return {
      success: true,
      data: {
        id: session.id,
        scheduledDate: session.scheduledDate.toISOString(),
        status: session.status,
        workout: {
          id: session.workout.id,
          name: session.workout.name,
          blocks: session.workout.blocks.map((b) => ({
            id: b.id,
            name: b.name,
            type: b.type,
            orderIndex: b.orderIndex,
            rounds: b.rounds,
            timeCap: b.timeCap,
            restBetweenRounds: b.restBetweenRounds,
            notes: b.notes,
            exercises: b.exercises.map((e) => ({
              id: e.id,
              orderIndex: e.orderIndex,
              restSeconds: e.restSeconds,
              notes: e.notes,
              exercise: {
                id: e.exercise.id,
                name: e.exercise.name,
                imageUrl: e.exercise.imageUrl,
                videoUrl: e.exercise.videoUrl,
              },
              sets: e.sets.map((s) => ({
                id: s.id,
                orderIndex: s.orderIndex,
                setType: s.setType,
                targetReps: s.targetReps,
                targetWeight: s.targetWeight,
                targetDuration: s.targetDuration,
                targetDurationUnit: s.targetDurationUnit,
                targetRPE: s.targetRPE,
                restAfter: s.restAfter,
              })),
            })),
          })),
        },
      },
    };
  } catch (error) {
    console.error("Failed to fetch session:", error);
    return { success: false, error: "Failed to fetch session" };
  }
}

// ---------------------------------------------------------------------------
// Delete a session (and its ad-hoc program if applicable)
// ---------------------------------------------------------------------------

export async function deleteSession(
  sessionId: string
): Promise<ActionResult<void>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId },
      include: {
        workout: {
          include: {
            program: { select: { id: true, trainerId: true, clientId: true, tags: true } },
            _count: { select: { sessions: true } },
          },
        },
      },
    });
    if (!session || session.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const clientId = session.workout.program.clientId;

    await prisma.workoutSessionV2.delete({ where: { id: sessionId } });

    // If this was an ad-hoc program with only this one session, clean it up
    const isAdHoc = session.workout.program.tags.includes("ad-hoc");
    if (isAdHoc && session.workout._count.sessions <= 1) {
      // Delete the entire ad-hoc program (cascades to workout, blocks, exercises, sets)
      await prisma.program.delete({ where: { id: session.workout.program.id } });
    }

    if (clientId) revalidateClient(clientId);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to delete session:", error);
    return { success: false, error: "Failed to delete session" };
  }
}

// ---------------------------------------------------------------------------
// Get sessions for client calendar (summary data)
// ---------------------------------------------------------------------------

export async function getCalendarSessions(clientId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const sessions = await prisma.workoutSessionV2.findMany({
      where: { clientId },
      include: {
        workout: {
          select: {
            id: true,
            name: true,
            blocks: {
              select: {
                exercises: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return { success: true as const, data: sessions };
  } catch (error) {
    console.error("Failed to fetch calendar sessions:", error);
    return { success: false as const, error: "Failed to fetch sessions" };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Duplicate block (inserts copy immediately after the original)
// ---------------------------------------------------------------------------

export async function duplicateBlockAction(blockId: string): Promise<ActionResult<{
  id: string;
  name: string | null;
  type: string;
  orderIndex: number;
  rounds: number;
  timeCap: number | null;
  restBetweenRounds: number | null;
  notes: string | null;
  exercises: Array<{
    id: string;
    orderIndex: number;
    restSeconds: number | null;
    notes: string | null;
    supersetGroup: string | null;
    exercise: { id: string; name: string; imageUrl: string | null; videoUrl: string | null };
    sets: Array<{
      id: string;
      orderIndex: number;
      setType: string;
      targetReps: number | null;
      targetWeight: number | null;
      targetDuration: number | null;
      targetDistance: number | null;
      targetRPE: number | null;
      targetPercentage1RM: number | null;
      restAfter: number | null;
      tempo: string | null;
    }>;
  }>;
}>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const block = await prisma.workoutBlockV2.findUnique({
      where: { id: blockId },
      include: {
        workout: { include: { program: { select: { trainerId: true, clientId: true } } } },
        exercises: {
          orderBy: { orderIndex: "asc" },
          include: {
            exercise: { select: { id: true, name: true, imageUrl: true, videoUrl: true } },
            sets: { orderBy: { orderIndex: "asc" } },
          },
        },
      },
    });

    if (!block || block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    // Shift all subsequent blocks up by 1 using individual updates (MongoDB does not
    // support atomic increment in updateMany via Prisma)
    const subsequentBlocks = await prisma.workoutBlockV2.findMany({
      where: { workoutId: block.workoutId, orderIndex: { gt: block.orderIndex } },
      select: { id: true, orderIndex: true },
      orderBy: { orderIndex: "desc" },
    });

    await prisma.$transaction(
      subsequentBlocks.map((b) =>
        prisma.workoutBlockV2.update({
          where: { id: b.id },
          data: { orderIndex: b.orderIndex + 1 },
        })
      )
    );

    // Create the duplicate block
    const newBlock = await prisma.workoutBlockV2.create({
      data: {
        workoutId: block.workoutId,
        name: block.name,
        type: block.type,
        orderIndex: block.orderIndex + 1,
        rounds: block.rounds,
        timeCap: block.timeCap,
        restBetweenRounds: block.restBetweenRounds,
        notes: block.notes,
      },
    });

    // Duplicate each exercise and its sets
    const newExercises = [];
    for (const ex of block.exercises) {
      const newEx = await prisma.blockExerciseV2.create({
        data: {
          blockId: newBlock.id,
          exerciseId: ex.exerciseId,
          orderIndex: ex.orderIndex,
          restSeconds: ex.restSeconds,
          notes: ex.notes,
          supersetGroup: ex.supersetGroup ?? null,
          sets: {
            create: ex.sets.map((s) => ({
              orderIndex: s.orderIndex,
              setType: s.setType,
              targetReps: s.targetReps,
              targetWeight: s.targetWeight,
              targetDuration: s.targetDuration,
              targetDistance: s.targetDistance ?? null,
              targetRPE: s.targetRPE,
              targetPercentage1RM: s.targetPercentage1RM ?? null,
              restAfter: s.restAfter,
              tempo: s.tempo ?? null,
            })),
          },
        },
        include: {
          exercise: { select: { id: true, name: true, imageUrl: true, videoUrl: true } },
          sets: { orderBy: { orderIndex: "asc" } },
        },
      });
      newExercises.push({
        id: newEx.id,
        orderIndex: newEx.orderIndex,
        restSeconds: newEx.restSeconds,
        notes: newEx.notes,
        supersetGroup: newEx.supersetGroup ?? null,
        exercise: newEx.exercise,
        sets: newEx.sets.map((s) => ({
          id: s.id,
          orderIndex: s.orderIndex,
          setType: s.setType,
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetDistance: s.targetDistance ?? null,
          targetRPE: s.targetRPE,
          targetPercentage1RM: s.targetPercentage1RM ?? null,
          restAfter: s.restAfter,
          tempo: s.tempo ?? null,
        })),
      });
    }

    if (block.workout.program.clientId) revalidateClient(block.workout.program.clientId);
    return {
      success: true,
      data: {
        id: newBlock.id,
        name: newBlock.name,
        type: newBlock.type,
        orderIndex: newBlock.orderIndex,
        rounds: newBlock.rounds,
        timeCap: newBlock.timeCap,
        restBetweenRounds: newBlock.restBetweenRounds,
        notes: newBlock.notes,
        exercises: newExercises,
      },
    };
  } catch (error) {
    console.error("Failed to duplicate block:", error);
    return { success: false, error: "Failed to duplicate block" };
  }
}

// ---------------------------------------------------------------------------
// Duplicate block exercise (inserts copy immediately after the original)
// ---------------------------------------------------------------------------

export async function duplicateBlockExerciseAction(blockExerciseId: string): Promise<ActionResult<{
  id: string;
  orderIndex: number;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  exercise: { id: string; name: string; imageUrl: string | null; videoUrl: string | null };
  sets: Array<{
    id: string;
    orderIndex: number;
    setType: string;
    targetReps: number | null;
    targetWeight: number | null;
    targetDuration: number | null;
    targetDistance: number | null;
    targetRPE: number | null;
    targetPercentage1RM: number | null;
    restAfter: number | null;
    tempo: string | null;
  }>;
}>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const blockExercise = await prisma.blockExerciseV2.findUnique({
      where: { id: blockExerciseId },
      include: {
        exercise: { select: { id: true, name: true, imageUrl: true, videoUrl: true } },
        sets: { orderBy: { orderIndex: "asc" } },
        block: {
          include: {
            workout: { include: { program: { select: { trainerId: true, clientId: true } } } },
          },
        },
      },
    });

    if (!blockExercise || blockExercise.block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    // Shift all subsequent exercises up by 1 using individual updates (MongoDB does not
    // support atomic increment in updateMany via Prisma)
    const subsequentExercises = await prisma.blockExerciseV2.findMany({
      where: { blockId: blockExercise.blockId, orderIndex: { gt: blockExercise.orderIndex } },
      select: { id: true, orderIndex: true },
      orderBy: { orderIndex: "desc" },
    });

    await prisma.$transaction(
      subsequentExercises.map((e) =>
        prisma.blockExerciseV2.update({
          where: { id: e.id },
          data: { orderIndex: e.orderIndex + 1 },
        })
      )
    );

    const newEx = await prisma.blockExerciseV2.create({
      data: {
        blockId: blockExercise.blockId,
        exerciseId: blockExercise.exerciseId,
        orderIndex: blockExercise.orderIndex + 1,
        restSeconds: blockExercise.restSeconds,
        notes: blockExercise.notes,
        supersetGroup: blockExercise.supersetGroup ?? null,
        sets: {
          create: blockExercise.sets.map((s) => ({
            orderIndex: s.orderIndex,
            setType: s.setType,
            targetReps: s.targetReps,
            targetWeight: s.targetWeight,
            targetDuration: s.targetDuration,
            targetDistance: s.targetDistance ?? null,
            targetRPE: s.targetRPE,
            targetPercentage1RM: s.targetPercentage1RM ?? null,
            restAfter: s.restAfter,
            tempo: s.tempo ?? null,
          })),
        },
      },
      include: {
        exercise: { select: { id: true, name: true, imageUrl: true, videoUrl: true } },
        sets: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (blockExercise.block.workout.program.clientId) {
      revalidateClient(blockExercise.block.workout.program.clientId);
    }
    return {
      success: true,
      data: {
        id: newEx.id,
        orderIndex: newEx.orderIndex,
        restSeconds: newEx.restSeconds,
        notes: newEx.notes,
        supersetGroup: newEx.supersetGroup ?? null,
        exercise: newEx.exercise,
        sets: newEx.sets.map((s) => ({
          id: s.id,
          orderIndex: s.orderIndex,
          setType: s.setType,
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetDistance: s.targetDistance ?? null,
          targetRPE: s.targetRPE,
          targetPercentage1RM: s.targetPercentage1RM ?? null,
          restAfter: s.restAfter,
          tempo: s.tempo ?? null,
        })),
      },
    };
  } catch (error) {
    console.error("Failed to duplicate exercise:", error);
    return { success: false, error: "Failed to duplicate exercise" };
  }
}

// ---------------------------------------------------------------------------
// Duplicate entire workout to a new date
// ---------------------------------------------------------------------------

export async function duplicateWorkoutToDateAction(
  sessionId: string,
  targetDate: string // ISO date string e.g. "2026-06-10"
): Promise<ActionResult<{ sessionId: string }>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId },
      include: {
        workout: {
          include: {
            program: { select: { trainerId: true, clientId: true } },
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
        },
      },
    });

    if (!session || session.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const { workout } = session;
    const clientId = workout.program.clientId;
    if (!clientId) return { success: false, error: "No client associated" };

    const newSession = await prisma.$transaction(async (tx) => {
      const program = await tx.program.create({
        data: {
          name: workout.name,
          trainerId: user.id,
          clientId,
          isTemplate: false,
          status: "ACTIVE",
          tags: ["ad-hoc"],
        },
      });

      const newWorkout = await tx.workout.create({
        data: {
          programId: program.id,
          name: workout.name,
          dayIndex: 0,
          weekIndex: 0,
          orderIndex: 0,
        },
      });

      for (const block of workout.blocks) {
        const newBlock = await tx.workoutBlockV2.create({
          data: {
            workoutId: newWorkout.id,
            name: block.name,
            type: block.type,
            orderIndex: block.orderIndex,
            rounds: block.rounds,
            timeCap: block.timeCap,
            restBetweenRounds: block.restBetweenRounds,
            notes: block.notes,
          },
        });

        for (const ex of block.exercises) {
          await tx.blockExerciseV2.create({
            data: {
              blockId: newBlock.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
              supersetGroup: ex.supersetGroup ?? null,
              sets: {
                create: ex.sets.map((s) => ({
                  orderIndex: s.orderIndex,
                  setType: s.setType,
                  targetReps: s.targetReps,
                  targetWeight: s.targetWeight,
                  targetDuration: s.targetDuration,
                  targetDistance: s.targetDistance ?? null,
                  targetRPE: s.targetRPE,
                  targetPercentage1RM: s.targetPercentage1RM ?? null,
                  restAfter: s.restAfter,
                  tempo: s.tempo ?? null,
                })),
              },
            },
          });
        }
      }

      return tx.workoutSessionV2.create({
        data: {
          workoutId: newWorkout.id,
          clientId,
          scheduledDate: new Date(targetDate),
          status: "SCHEDULED",
        },
      });
    }, { timeout: 30000 });

    revalidateClient(clientId);
    return { success: true, data: { sessionId: newSession.id } };
  } catch (error) {
    console.error("Failed to duplicate workout:", error);
    return { success: false, error: "Failed to duplicate workout" };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionWithFullWorkout = {
  exerciseLogs?: {
    id: string;
    blockExerciseId: string;
    status: string;
    setLogs: {
      setIndex: number;
      actualReps?: number | null;
      actualWeight?: number | null;
      actualDuration?: number | null;
      actualRPE?: number | null;
    }[]
  }[];
  overallRPE?: number | null;
  overallNotes?: string | null;
  feedback?: any[];
  id: string;
  scheduledDate: string;
  status: string;
  workout: {
    id: string;
    name: string;
    blocks: {
      id: string;
      name: string | null;
      type: string;
      orderIndex: number;
      rounds: number;
      timeCap: number | null;
      restBetweenRounds: number | null;
      notes: string | null;
      exercises: {
        id: string;
        orderIndex: number;
        restSeconds: number | null;
        notes: string | null;
        exercise: {
          id: string;
          name: string;
          imageUrl: string | null;
          videoUrl: string | null;
        };
        sets: {
          id: string;
          orderIndex: number;
          setType: string;
          targetReps: number | null;
          targetWeight: number | null;
          targetDuration: number | null;
          targetDurationUnit?: string | null;
          targetRPE: number | null;
          restAfter: number | null;
        }[];
      }[];
    }[];
  };
};

// ---------------------------------------------------------------------------
// Paste exercises from clipboard into a block
// ---------------------------------------------------------------------------

type PasteExerciseInput = {
  exerciseId: string;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  sets: {
    orderIndex: number;
    setType: string;
    targetReps: number | null;
    targetWeight: number | null;
    targetDuration: number | null;
    targetRPE: number | null;
    restAfter: number | null;
  }[];
};

export async function pasteExercisesToBlockAction(
  blockId: string,
  exercises: PasteExerciseInput[]
): Promise<ActionResult<void>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const block = await prisma.workoutBlockV2.findUnique({
      where: { id: blockId },
      include: {
        workout: {
          include: { program: { select: { trainerId: true, clientId: true } } },
        },
        exercises: {
          select: { orderIndex: true },
          orderBy: { orderIndex: "desc" },
          take: 1,
        },
      },
    });
    if (!block || block.workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    let nextOrder = (block.exercises[0]?.orderIndex ?? -1) + 1;
    for (const ex of exercises) {
      await prisma.blockExerciseV2.create({
        data: {
          blockId,
          exerciseId: ex.exerciseId,
          orderIndex: nextOrder++,
          restSeconds: ex.restSeconds,
          notes: ex.notes,
          supersetGroup: ex.supersetGroup,
          sets: {
            create: ex.sets.map((s) => ({
              orderIndex: s.orderIndex,
              setType: s.setType,
              targetReps: s.targetReps,
              targetWeight: s.targetWeight,
              targetDuration: s.targetDuration,
              targetRPE: s.targetRPE,
              restAfter: s.restAfter,
            })),
          },
        },
      });
    }

    if (block.workout.program.clientId) revalidateClient(block.workout.program.clientId);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to paste exercises:", error);
    return { success: false, error: "Failed to paste exercises" };
  }
}

// ---------------------------------------------------------------------------
// Paste a block from clipboard into a workout
// ---------------------------------------------------------------------------

type PasteBlockInput = {
  name: string | null;
  type: string;
  rounds: number;
  timeCap: number | null;
  restBetweenRounds: number | null;
  notes: string | null;
  exercises: PasteExerciseInput[];
};

export async function pasteBlockToWorkoutAction(
  workoutId: string,
  block: PasteBlockInput
): Promise<ActionResult<void>> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        program: { select: { trainerId: true, clientId: true } },
        blocks: {
          select: { orderIndex: true },
          orderBy: { orderIndex: "desc" },
          take: 1,
        },
      },
    });
    if (!workout || workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" };
    }

    const nextBlockOrder = (workout.blocks[0]?.orderIndex ?? -1) + 1;

    await prisma.workoutBlockV2.create({
      data: {
        workoutId,
        name: block.name,
        type: block.type,
        orderIndex: nextBlockOrder,
        rounds: block.rounds,
        timeCap: block.timeCap,
        restBetweenRounds: block.restBetweenRounds,
        notes: block.notes,
        exercises: {
          create: block.exercises.map((ex, exIdx) => ({
            exerciseId: ex.exerciseId,
            orderIndex: exIdx,
            restSeconds: ex.restSeconds,
            notes: ex.notes,
            supersetGroup: ex.supersetGroup,
            sets: {
              create: ex.sets.map((s) => ({
                orderIndex: s.orderIndex,
                setType: s.setType,
                targetReps: s.targetReps,
                targetWeight: s.targetWeight,
                targetDuration: s.targetDuration,
                targetRPE: s.targetRPE,
                restAfter: s.restAfter,
              })),
            },
          })),
        },
      },
    });

    if (workout.program.clientId) revalidateClient(workout.program.clientId);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Failed to paste block:", error);
    return { success: false, error: "Failed to paste block" };
  }
}

