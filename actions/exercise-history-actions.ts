
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getClientIdsForTrainer } from "@/lib/services/client.service";

export async function getClientExerciseHistory(clientId: string, exerciseId: string, limit: number = 3) {
  const user = await getCurrentUser();

  if (user.role === "CLIENT" && user.id !== clientId) {
    return { success: false, error: "Unauthorized" };
  }
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(clientId)) {
      return { success: false, error: "Unauthorized" };
    }
  }

  try {
    const sessions = await prisma.workoutSessionV2.findMany({
      where: {
        clientId,
        status: { in: ["COMPLETED", "IN_PROGRESS", "SCHEDULED"] },
        workout: {
          blocks: {
            some: {
              exercises: {
                some: { exerciseId }
              }
            }
          }
        },
        scheduledDate: { lte: new Date() }
      },
      orderBy: { scheduledDate: "desc" },
      take: limit,
      include: {
        workout: {
          include: {
            blocks: {
              include: {
                exercises: {
                  where: { exerciseId },
                  include: { sets: { orderBy: { orderIndex: "asc" } } }
                }
              }
            }
          }
        },
        exerciseLogs: {
          include: { setLogs: { orderBy: { setIndex: "asc" } } }
        }
      }
    });

    const history = sessions.map(session => {
      // Find the specific block exercises for this exerciseId in the session
      const matchedBlockExercises = session.workout.blocks.flatMap(b => b.exercises);
      
      const exerciseRecords = matchedBlockExercises.map(blockEx => {
        // Find corresponding log if it exists
        const log = session.exerciseLogs.find(l => l.blockExerciseId === blockEx.id);
        return {
          blockExerciseId: blockEx.id,
          targetSets: blockEx.sets,
          actualSets: log?.setLogs || [],
          status: log?.status || "PENDING",
        };
      });

      return {
        sessionId: session.id,
        scheduledDate: session.scheduledDate,
        status: session.status,
        records: exerciseRecords
      };
    });

    return { success: true, data: history };
  } catch (error) {
    return { success: false, error: "Failed to fetch exercise history" };
  }
}

