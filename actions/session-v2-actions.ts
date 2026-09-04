"use server";

import React from "react";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { getResend } from "@/lib/email/resend";
import { SessionCompletedEmail } from "@/lib/email/templates/session-completed";
import { computeScheduleVariance } from "@/lib/services/session.service";

async function notifyTrainerOnCompletion(
  sessionId: string,
  client: { id: string; firstName: string; lastName: string }
) {
  const session = await prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      workout: {
        include: {
          program: {
            include: {
              trainer: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      },
    },
  });

  if (!session?.workout.program.trainer) return;

  const { trainer } = session.workout.program;
  const clientName = `${client.firstName} ${client.lastName}`;
  const workoutName = session.workout.name;
  const programName = session.workout.program.name;
  const programId = session.workout.program.id;
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app";
  const clientLink = `${appBaseUrl}/clients/${client.id}`;

  await createNotification({
    userId: trainer.id,
    type: NOTIFICATION_TYPES.SESSION_COMPLETED,
    title: "Session Completed",
    body: `${clientName} completed "${workoutName}".`,
    link: clientLink,
    metadata: { clientId: client.id, clientName, workoutName, programId },
  });

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
    to: trainer.email,
    subject: `${clientName} completed a session`,
    react: React.createElement(SessionCompletedEmail, {
      trainerName: `${trainer.firstName} ${trainer.lastName}`,
      clientName,
      workoutName,
      programName,
      clientLink,
    }),
  });
}

// Notifies the trainer once, at Finish Workout, if the client left a note on
// any exercise — avoids firing a notification per debounced keystroke.
async function notifyTrainerOfClientNotes(
  sessionId: string,
  client: { id: string; firstName: string; lastName: string }
) {
  const session = await prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      workout: {
        include: {
          program: {
            include: {
              trainer: { select: { id: true } },
            },
          },
        },
      },
      exerciseLogs: { where: { clientNote: { not: null } } },
    },
  });

  const notedLogs = session?.exerciseLogs.filter(
    (l) => l.clientNote && l.clientNote.trim().length > 0
  );
  if (!session?.workout.program.trainer || !notedLogs || notedLogs.length === 0) return;

  const { trainer } = session.workout.program;
  const clientName = `${client.firstName} ${client.lastName}`;
  const workoutName = session.workout.name;

  const blockExercises = await prisma.blockExerciseV2.findMany({
    where: { id: { in: notedLogs.map((l) => l.blockExerciseId) } },
    include: { exercise: { select: { name: true } } },
  });
  const exerciseNameById = new Map(blockExercises.map((be) => [be.id, be.exercise.name]));
  const exerciseNames = notedLogs.map((l) => exerciseNameById.get(l.blockExerciseId) ?? "an exercise");
  const summary = exerciseNames.length === 1 ? exerciseNames[0] : `${exerciseNames.length} exercises`;

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app";
  const link = `${appBaseUrl}/clients/${client.id}/sessions/${sessionId}`;

  await createNotification({
    userId: trainer.id,
    type: NOTIFICATION_TYPES.EXERCISE_NOTE,
    title: "New exercise note",
    body: `${clientName} left a note on ${summary} in "${workoutName}".`,
    link,
    metadata: { clientId: client.id, clientName, workoutName, sessionId, exerciseCount: exerciseNames.length },
  });
}

export async function startSessionV2Action(sessionId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };
  
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false, error: "User not found" };

  try {
    const session = await prisma.workoutSessionV2.update({
      where: { id: sessionId, clientId: dbUser.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() }
    });
    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true, data: session };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to start session" };
  }
}

export async function updateSetLogV2Action(
  sessionId: string,
  blockExerciseId: string,
  setIndex: number,
  data: {
    actualReps?: number;
    actualWeight?: number;
    actualDuration?: number;
    actualDistance?: number;
    actualRPE?: number;
    notes?: string;
  }
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, clientId: dbUser.id }
    });
    if (!session) return { success: false, error: "Session not found" };

    if (session.status === "SCHEDULED" || session.status === "MISSED") {
      await prisma.workoutSessionV2.update({
        where: { id: sessionId },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

    let exerciseLog = await prisma.sessionExerciseLog.findFirst({
      where: { sessionId, blockExerciseId }
    });

    if (!exerciseLog) {
      // Need to find the block exercise order index just in case, or default to 0
      const blockEx = await prisma.blockExerciseV2.findUnique({
        where: { id: blockExerciseId }
      });
      exerciseLog = await prisma.sessionExerciseLog.create({
        data: {
          sessionId,
          blockExerciseId,
          orderIndex: blockEx?.orderIndex || 0,
          status: "IN_PROGRESS"
        }
      });
    }

    let setLog = await prisma.setLog.findFirst({
      where: { sessionExerciseLogId: exerciseLog.id, setIndex }
    });

    if (setLog) {
      setLog = await prisma.setLog.update({
        where: { id: setLog.id },
        data: { ...data, completedAt: new Date() }
      });
    } else {
      setLog = await prisma.setLog.create({
        data: {
          sessionExerciseLogId: exerciseLog.id,
          setIndex,
          ...data,
          completedAt: new Date()
        }
      });
    }

    revalidatePath("/sessions/" + sessionId);
    return { success: true, data: setLog };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to update set log" };
  }
}

export async function updateExerciseActualSetsAction(
  sessionId: string,
  blockExerciseId: string,
  actualSets: number | null
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, clientId: dbUser.id },
    });
    if (!session) return { success: false, error: "Session not found" };

    const exerciseLog = await prisma.sessionExerciseLog.findFirst({
      where: { sessionId, blockExerciseId },
    });

    if (exerciseLog) {
      await prisma.sessionExerciseLog.update({
        where: { id: exerciseLog.id },
        data: { actualSets },
      });
    } else {
      const blockEx = await prisma.blockExerciseV2.findUnique({ where: { id: blockExerciseId } });
      await prisma.sessionExerciseLog.create({
        data: { sessionId, blockExerciseId, orderIndex: blockEx?.orderIndex ?? 0, status: "IN_PROGRESS", actualSets },
      });
    }

    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to update actual sets" };
  }
}

export async function updateExerciseClientNoteAction(
  sessionId: string,
  blockExerciseId: string,
  clientNote: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, clientId: dbUser.id },
    });
    if (!session) return { success: false, error: "Session not found" };

    const trimmedNote = clientNote.trim() || null;

    const exerciseLog = await prisma.sessionExerciseLog.findFirst({
      where: { sessionId, blockExerciseId },
    });

    if (exerciseLog) {
      await prisma.sessionExerciseLog.update({
        where: { id: exerciseLog.id },
        data: { clientNote: trimmedNote },
      });
    } else {
      const blockEx = await prisma.blockExerciseV2.findUnique({ where: { id: blockExerciseId } });
      await prisma.sessionExerciseLog.create({
        data: { sessionId, blockExerciseId, orderIndex: blockEx?.orderIndex ?? 0, status: "PENDING", clientNote: trimmedNote },
      });
    }

    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to save note" };
  }
}

export async function completeSessionV2Action(
  sessionId: string,
  overallRPE?: number,
  overallNotes?: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, clientId: dbUser.id },
      select: { scheduledDate: true },
    });
    if (!session) return { success: false, error: "Session not found" };

    const completedAt = new Date();
    const scheduleVariance = computeScheduleVariance(session.scheduledDate, completedAt);

    await prisma.workoutSessionV2.update({
      where: { id: sessionId, clientId: dbUser.id },
      data: { status: "COMPLETED", completedAt, overallRPE, overallNotes, scheduleVariance },
    });

    // Fire trainer notifications — non-blocking, failures must not break completion
    try {
      await notifyTrainerOnCompletion(sessionId, {
        id: dbUser.id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
      });
    } catch (notifyErr) {
      console.error("Completion notification failed (non-fatal):", notifyErr);
    }

    try {
      await notifyTrainerOfClientNotes(sessionId, {
        id: dbUser.id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
      });
    } catch (notifyErr) {
      console.error("Exercise note notification failed (non-fatal):", notifyErr);
    }

    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to complete session" };
  }
}

export async function markExerciseDoneAction(
  sessionId: string,
  blockExerciseId: string,
  setCount: number,
  done: boolean
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false as const, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, clientId: dbUser.id },
      select: { status: true },
    });
    if (!session) return { success: false as const, error: "Session not found" };

    if (session.status === "SCHEDULED" || session.status === "MISSED") {
      await prisma.workoutSessionV2.update({
        where: { id: sessionId },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

    if (done) {
      const blockEx = await prisma.blockExerciseV2.findUnique({ where: { id: blockExerciseId } });
      let exerciseLog = await prisma.sessionExerciseLog.findFirst({
        where: { sessionId, blockExerciseId },
      });
      if (!exerciseLog) {
        exerciseLog = await prisma.sessionExerciseLog.create({
          data: { sessionId, blockExerciseId, orderIndex: blockEx?.orderIndex ?? 0, status: "COMPLETED", completedAt: new Date() },
        });
      } else {
        await prisma.sessionExerciseLog.update({
          where: { id: exerciseLog.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }
      for (let i = 0; i < Math.max(1, setCount); i++) {
        const existing = await prisma.setLog.findFirst({
          where: { sessionExerciseLogId: exerciseLog.id, setIndex: i },
        });
        if (!existing) {
          await prisma.setLog.create({
            data: { sessionExerciseLogId: exerciseLog.id, setIndex: i, completedAt: new Date() },
          });
        }
      }
    } else {
      const exerciseLog = await prisma.sessionExerciseLog.findFirst({
        where: { sessionId, blockExerciseId },
      });
      if (exerciseLog) {
        await prisma.sessionExerciseLog.update({
          where: { id: exerciseLog.id },
          data: { status: "PENDING", completedAt: null },
        });
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true as const };
  } catch (error) {
    console.error(error);
    return { success: false as const, error: "Failed to update exercise" };
  }
}
