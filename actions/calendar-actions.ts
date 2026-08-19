"use server";

import { prisma as db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { SessionStatus } from "@prisma/client";
import { getClientIdsForTrainer } from "@/lib/services/client.service";

export async function getClientWorkoutSessions(clientId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Unauthorized");
    }

    if (user.role === "CLIENT" && user.id !== clientId) {
      throw new Error("Unauthorized");
    }
    if (user.role === "TRAINER") {
      const clientIds = await getClientIdsForTrainer(user.id);
      if (!clientIds.includes(clientId)) {
        throw new Error("Unauthorized");
      }
    }

    const sessions = await db.workoutSession.findMany({
      where: {
        clientId,
      },
      include: {
        plan: {
          select: {
            title: true,
          }
        }
      },
      orderBy: {
        scheduledDate: "asc",
      },
    });

    return { success: true, sessions };
  } catch (error) {
    console.error("Error fetching client workout sessions:", error);
    return { success: false, error: "Failed to fetch workout sessions" };
  }
}

export async function updateSessionDate(sessionId: string, newDate: Date) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Unauthorized");
    }

    // Verify session exists and user has permission
    const session = await db.workoutSession.findUnique({
      where: { id: sessionId },
      select: { clientId: true, plan: { select: { createdById: true } } }
    });

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    if (user.role === "CLIENT" && session.clientId !== user.id) {
       return { success: false, error: "Unauthorized" };
    }

    if (user.role === "TRAINER" && session.plan?.createdById !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const updatedSession = await db.workoutSession.update({
      where: { id: sessionId },
      data: {
        scheduledDate: newDate,
      },
      include: {
        plan: {
          select: { title: true }
        }
      }
    });

    revalidatePath(`/dashboard`);
    revalidatePath(`/clients/${session.clientId}`);
    
    return { success: true, session: updatedSession };
  } catch (error) {
    console.error("Error updating session date:", error);
    return { success: false, error: "Failed to update session date" };
  }
}
export async function scheduleProgramForClientAction({
  programId,
  clientId,
  startDate,
  preferredWeekdays,
  customWorkoutDates,
}: {
  programId: string;
  clientId: string;
  startDate: string;
  preferredWeekdays?: string[];
  customWorkoutDates?: Record<string, string>;
}) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "TRAINER") {
      return { success: false, error: "Unauthorized or Forbidden" };
    }

    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(clientId)) {
      return { success: false, error: "Unauthorized or Forbidden" };
    }

    const sourceProgram = await db.program.findUnique({
      where: { id: programId },
      include: {
        workouts: {
          include: {
            blocks: {
              include: {
                exercises: {
                  include: {
                    sets: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!sourceProgram) {
      return { success: false, error: "Program not found" };
    }

    if (sourceProgram.trainerId !== user.id) {
      return { success: false, error: "Unauthorized or Forbidden" };
    }

    // Parse as local midnight to avoid UTC timezone shifting the date backward
    const [syear, smonth, sday] = startDate.split("-").map(Number);
    const sDate = new Date(syear, smonth - 1, sday);

    const weekdayToIndex: Record<string, number> = {
      monday: 0,
      tuesday: 1,
      wednesday: 2,
      thursday: 3,
      friday: 4,
      saturday: 5,
      sunday: 6,
    };

    const selectedDayIndexes = Array.from(
      new Set(
        (preferredWeekdays ?? [])
          .map((d) => weekdayToIndex[d.toLowerCase().trim()])
          .filter((d): d is number => Number.isInteger(d))
      )
    ).sort((a, b) => a - b);

    const sortedWorkouts = [...sourceProgram.workouts].sort((a, b) => {
      if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.orderIndex - b.orderIndex;
    });

    // Returns the next occurrence of a Mon-based weekday index (0=Mon…6=Sun)
    // on or after `from`. Always advances forward, never backward.
    function nextOccurrenceOnOrAfter(from: Date, monBasedIdx: number): Date {
      // Convert Mon-based (0=Mon) to JS getDay (0=Sun, 1=Mon…)
      const targetJsDay = monBasedIdx === 6 ? 0 : monBasedIdx + 1;
      const result = new Date(from);
      const diff = (targetJsDay - result.getDay() + 7) % 7;
      result.setDate(result.getDate() + diff);
      return result;
    }

    // Pre-compute each workout's date using a sequential cursor so that
    // workouts are always placed in program order regardless of start date.
    // e.g. startDate=Wednesday: DAY1→next Mon, DAY2→next Tue, DAY3→next Wed, DAY4→next Thu
    // rather than anchoring to the current week and bumping only stale slots.
    const workoutDateById = new Map<string, Date>();
    let cursor = new Date(sDate);

    for (let i = 0; i < sortedWorkouts.length; i++) {
      const w = sortedWorkouts[i];
      if (customWorkoutDates?.[w.id]) {
        const raw = customWorkoutDates[w.id];
        const [cy, cm, cd] = raw.split("-").map(Number);
        workoutDateById.set(w.id, new Date(cy, cm - 1, cd));
      } else if (selectedDayIndexes.length > 0) {
        const targetDayIndex = selectedDayIndexes[i % selectedDayIndexes.length];
        const workoutDate = nextOccurrenceOnOrAfter(cursor, targetDayIndex);
        workoutDateById.set(w.id, workoutDate);
        // Advance cursor past this workout so the next one is always later
        cursor = new Date(workoutDate);
        cursor.setDate(cursor.getDate() + 1);
      } else {
        const workoutDate = new Date(sDate);
        workoutDate.setDate(workoutDate.getDate() + w.weekIndex * 7 + w.dayIndex);
        workoutDateById.set(w.id, workoutDate);
      }
    }

    const newProgram = await db.program.create({
      data: {
        name: sourceProgram.name,
        description: sourceProgram.description,
        isTemplate: false,
        sourceTemplateId: sourceProgram.id,
        trainerId: user.id,
        clientId: clientId,
        status: "ACTIVE",
        durationWeeks: sourceProgram.durationWeeks,
        daysPerWeek: sourceProgram.daysPerWeek,
        tags: sourceProgram.tags,
        startDate: sDate,
        workouts: {
          create: sortedWorkouts.map((w) => {
            const workoutDate = workoutDateById.get(w.id) ?? new Date(sDate);

            return {
              name: w.name,
              description: w.description,
              dayIndex: w.dayIndex,
              weekIndex: w.weekIndex,
              orderIndex: w.orderIndex,
              estimatedMinutes: w.estimatedMinutes,
              blocks: {
                create: w.blocks.map((b) => ({
                  name: b.name,
                  type: b.type,
                  orderIndex: b.orderIndex,
                  rounds: b.rounds,
                  restBetweenRounds: b.restBetweenRounds,
                  timeCap: b.timeCap,
                  notes: b.notes,
                  exercises: {
                    create: b.exercises.map((e) => ({
                      exerciseId: e.exerciseId,
                      orderIndex: e.orderIndex,
                      restSeconds: e.restSeconds,
                      notes: e.notes,
                      supersetGroup: e.supersetGroup,
                      sets: {
                        create: e.sets.map((s: any) => ({
                          orderIndex: s.orderIndex,
                          setType: s.setType,
                          targetReps: s.targetReps,
                          targetWeight: s.targetWeight,
                          targetDuration: s.targetDuration,
                          targetDistance: s.targetDistance,
                          targetRPE: s.targetRPE,
                          targetPercentage1RM: s.targetPercentage1RM,
                          tempo: s.tempo,
                          restAfter: s.restAfter,
                        })),
                      },
                    })),
                  },
                })),
              },
              sessions: {
                create: [
                  {
                    clientId: clientId,
                    scheduledDate: workoutDate,
                    status: "SCHEDULED",
                  },
                ],
              },
            };
          }),
        },
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/programs");

    return { success: true, programId: newProgram.id };
  } catch (error) {
    console.error("Failed to schedule program:", error);
    return { success: false, error: "Failed to schedule program" };
  }
}