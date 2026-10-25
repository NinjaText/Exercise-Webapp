"use server";

import { activeCallerOnly } from "@/lib/auth/active-user";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { appBaseUrl } from "@/lib/utils/app-url";
import { computeScheduleVariance } from "@/lib/services/session.service";
import { getProgramSchedulingType } from "@/lib/services/program.service";
import { logUserAudit, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { getCapabilitiesForUser, canCoachInteract } from "@/lib/org-capabilities.server";
import { sendContextMessageToTrainer } from "@/lib/services/context-message.service";
import {
  completeFollowAlongSessionSchema,
  type CompleteFollowAlongSessionInput,
} from "@/lib/validators/follow-along";
import {
  isVideoWorkout,
  isFollowAlongProgram,
  dayNumberFromIndices,
  getFollowAlongTotalDays,
  formatDayOfTotal,
  getFeelingLabel,
  watchedSecondsToMinutes,
} from "@/lib/utils/follow-along";

type NotifyingClient = { id: string; firstName: string; lastName: string };

async function notifyTrainerOnCompletion(sessionId: string, client: NotifyingClient) {
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
  const clientLink = `${appBaseUrl()}/clients/${client.id}`;

  await notifyUser({
    userId: trainer.id,
    type: NOTIFICATION_TYPES.SESSION_COMPLETED,
    title: "Session Completed",
    body: `${clientName} completed "${workoutName}".`,
    link: clientLink,
    metadata: { clientId: client.id, clientName, workoutName, programId },
    recipientEmail: trainer.email,
    recipientName: `${trainer.firstName} ${trainer.lastName}`,
    // SessionCompletedEmail's own prop is `trainerName`, not `recipientName`,
    // and Task 2 preserved existing prop names — so pass it explicitly.
    email: {
      trainerName: `${trainer.firstName} ${trainer.lastName}`,
      clientName,
      workoutName,
      programName,
      clientLink,
    },
  });
}

// Notifies the trainer once, at Finish Workout, if the client left a note on
// any exercise — avoids firing a notification per debounced keystroke.
async function notifyTrainerOfClientNotes(sessionId: string, client: NotifyingClient) {
  const session = await prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      workout: {
        include: {
          program: {
            include: {
              trainer: { select: { id: true, email: true, firstName: true, lastName: true } },
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

  const link = `${appBaseUrl()}/clients/${client.id}/sessions/${sessionId}`;

  await notifyUser({
    userId: trainer.id,
    type: NOTIFICATION_TYPES.EXERCISE_NOTE,
    title: "New exercise note",
    body: `${clientName} left a note on ${summary} in "${workoutName}".`,
    link,
    metadata: { clientId: client.id, clientName, workoutName, sessionId, exerciseCount: exerciseNames.length },
    recipientEmail: trainer.email,
    recipientName: `${trainer.firstName} ${trainer.lastName}`,
    email: { clientName, workoutName, summary, sessionLink: link },
  });
}

export async function startSessionV2Action(sessionId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };
  
  const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!dbUser) return { success: false, error: "User not found" };

  try {
    const session = await prisma.workoutSessionV2.update({
      where: { id: sessionId, clientId: dbUser.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
      include: { workout: { select: { name: true } } },
    });
    await logUserAudit(dbUser, () => ({
      action: AUDIT_ACTIONS.WORKOUT_STARTED,
      targetType: "WorkoutSession",
      targetId: session.id,
      targetLabel: session.workout.name,
    }));
    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true, data: session };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to start session" };
  }
}

/**
 * Opens an On-Demand ("Resource") workout for the signed-in client.
 *
 * Resources are assigned without any pre-generated WorkoutSessionV2 rows —
 * the mark-missed-sessions cron flips every SCHEDULED session older than 24h
 * to MISSED with no program-type awareness, so a pre-generated row would make
 * an anytime resource show up as non-compliance. The session row is therefore
 * created here, lazily, at the moment the client actually starts the workout,
 * straight into IN_PROGRESS with scheduledDate = startedAt = now.
 *
 * A resource is meant to be repeatable, so an already-finished run (COMPLETED
 * /MISSED/SKIPPED) is left alone and a fresh session is started instead; only
 * a still-open run is resumed.
 *
 * Scheduled programs are untouched by this path: their sessions are always
 * pre-generated at assignment time, so this action refuses to create one.
 */
export async function startOnDemandWorkoutAction(workoutId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  try {
    const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
    if (!dbUser) return { success: false as const, error: "User not found" };

    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      select: {
        id: true,
        name: true,
        program: { select: { clientId: true, schedulingType: true } },
      },
    });
    if (!workout) return { success: false as const, error: "Workout not found" };
    if (workout.program.clientId !== dbUser.id) {
      return { success: false as const, error: "Forbidden" };
    }
    if (getProgramSchedulingType(workout.program) !== "ON_DEMAND") {
      return {
        success: false as const,
        error: "This workout isn't a resource",
      };
    }

    // Resume a run that's still open rather than stacking duplicate rows.
    const openSession = await prisma.workoutSessionV2.findFirst({
      where: {
        workoutId,
        clientId: dbUser.id,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
      orderBy: { scheduledDate: "desc" },
    });

    const logStarted = (id: string) =>
      logUserAudit(dbUser, () => ({
        action: AUDIT_ACTIONS.WORKOUT_STARTED,
        targetType: "WorkoutSession",
        targetId: id,
        targetLabel: workout.name,
        metadata: { onDemand: true },
      }));

    if (openSession) {
      const session =
        openSession.status === "IN_PROGRESS"
          ? openSession
          : await prisma.workoutSessionV2.update({
              where: { id: openSession.id },
              data: { status: "IN_PROGRESS", startedAt: new Date() },
            });
      // Resuming a run that's already in progress isn't a new start.
      if (openSession.status !== "IN_PROGRESS") await logStarted(session.id);
      revalidatePath("/dashboard");
      revalidatePath("/sessions/" + session.id);
      return { success: true as const, data: session };
    }

    const now = new Date();
    const session = await prisma.workoutSessionV2.create({
      data: {
        workoutId,
        clientId: dbUser.id,
        scheduledDate: now,
        startedAt: now,
        status: "IN_PROGRESS",
      },
    });
    await logStarted(session.id);

    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + session.id);
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to start on-demand workout:", error);
    return { success: false as const, error: "Failed to start workout" };
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
    const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
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
    const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
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
    const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
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

type CompletingClient = User;

/**
 * Everything "finish a session" means, shared by the logged-workout tracker
 * (completeSessionV2Action) and the follow-along player
 * (completeFollowAlongSessionAction) so the two can't drift: stamp status,
 * completedAt and scheduleVariance, write the audit entry, and notify the
 * trainer. Callers own auth and must have already confirmed the session
 * belongs to `dbUser`.
 */
async function finalizeSessionCompletion(
  dbUser: CompletingClient,
  session: { id: string; scheduledDate: Date; startedAt: Date | null; workoutName: string },
  result: {
    overallRPE?: number;
    overallNotes?: string;
    /** Follow-along only — see lib/utils/follow-along.ts. */
    feelingRating?: string | null;
    watchedSeconds?: number;
    durationMinutes?: number;
  },
  options: { onlyIfNotCompleted?: boolean } = {}
): Promise<{ completed: boolean }> {
  const { overallRPE, overallNotes, feelingRating, watchedSeconds, durationMinutes } = result;
  const completedAt = new Date();
  const scheduleVariance = computeScheduleVariance(session.scheduledDate, completedAt);
  const data = {
    status: "COMPLETED",
    completedAt,
    overallRPE,
    overallNotes,
    scheduleVariance,
    ...(feelingRating !== undefined && { feelingRating }),
    ...(watchedSeconds !== undefined && { watchedSeconds }),
    ...(durationMinutes !== undefined && { durationMinutes }),
  };

  if (options.onlyIfNotCompleted) {
    // Atomic claim: of two concurrent submits only one flips the row, so only
    // one sends the audit entry, notifications and trainer message.
    const { count } = await prisma.workoutSessionV2.updateMany({
      where: { id: session.id, clientId: dbUser.id, status: { not: "COMPLETED" } },
      data,
    });
    if (count === 0) return { completed: false };
  } else {
    await prisma.workoutSessionV2.update({ where: { id: session.id, clientId: dbUser.id }, data });
  }

  const elapsedMinutes =
    durationMinutes ??
    (session.startedAt ? Math.round((completedAt.getTime() - session.startedAt.getTime()) / 60000) : undefined);
  await logUserAudit(dbUser, () => ({
    action: AUDIT_ACTIONS.WORKOUT_COMPLETED,
    targetType: "WorkoutSession",
    targetId: session.id,
    targetLabel: session.workoutName,
    metadata: {
      ...(overallRPE != null && { rpe: overallRPE }),
      ...(elapsedMinutes !== undefined && { durationMinutes: elapsedMinutes }),
      scheduleVariance,
    },
  }));

  // Fire trainer notifications — non-blocking, failures must not break completion.
  // Uncoached club members have no coach to notify (coachNotifications off).
  try {
    const caps = await getCapabilitiesForUser(dbUser);
    if (caps.coachNotifications) {
      const client: NotifyingClient = {
        id: dbUser.id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
      };
      try {
        await notifyTrainerOnCompletion(session.id, client);
      } catch (notifyErr) {
        console.error("Completion notification failed (non-fatal):", notifyErr);
      }

      try {
        await notifyTrainerOfClientNotes(session.id, client);
      } catch (notifyErr) {
        console.error("Exercise note notification failed (non-fatal):", notifyErr);
      }
    }
  } catch (capsErr) {
    console.error("Coach notification lookup failed (non-fatal):", capsErr);
  }

  revalidatePath("/dashboard");
  revalidatePath("/sessions/" + session.id);
  return { completed: true };
}

export async function completeSessionV2Action(
  sessionId: string,
  overallRPE?: number,
  overallNotes?: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
    if (!dbUser) return { success: false, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, clientId: dbUser.id },
      select: { scheduledDate: true, startedAt: true, workout: { select: { name: true } } },
    });
    if (!session) return { success: false, error: "Session not found" };

    await finalizeSessionCompletion(
      dbUser,
      {
        id: sessionId,
        scheduledDate: session.scheduledDate,
        startedAt: session.startedAt,
        workoutName: session.workout?.name,
      },
      { overallRPE, overallNotes }
    );
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to complete session" };
  }
}

/**
 * Finishes a follow-along video session from the "How did it go?" dialog.
 *
 * Same ownership check as every session action (the session must belong to
 * the caller), then the shared completion path with the follow-along fields.
 * When the client wrote a comment and their org allows messaging, the comment
 * also lands in the trainer's inbox as a WORKOUT_FEEDBACK context message so
 * the trainer can reply in the normal thread.
 */
export async function completeFollowAlongSessionAction(input: CompleteFollowAlongSessionInput) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const parsed = completeFollowAlongSessionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0].message };
  const { sessionId, feelingRating, watchedSeconds, videoEnded } = parsed.data;
  const comment = parsed.data.comment?.trim() || null;
  // A session that never actually played (load error, instant stop) isn't a
  // workout — keep it open rather than recording a 0-second completion.
  if (watchedSeconds === 0 && !videoEnded) {
    return { success: false as const, error: "Play the video before finishing this session" };
  }

  try {
    const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
    if (!dbUser) return { success: false as const, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, clientId: dbUser.id },
      select: {
        status: true,
        scheduledDate: true,
        startedAt: true,
        workout: {
          select: {
            name: true,
            videoUrl: true,
            weekIndex: true,
            dayIndex: true,
            program: {
              select: {
                trainerId: true,
                contentFormat: true,
                durationWeeks: true,
                workouts: { select: { weekIndex: true, dayIndex: true } },
              },
            },
          },
        },
      },
    });
    if (!session) return { success: false as const, error: "Session not found" };
    if (!isVideoWorkout(session.workout)) {
      return { success: false as const, error: "This session isn't a follow-along video" };
    }
    // A double submit (or a second tab) is not an error for the client — the
    // session is done either way — but must not re-send the comment.
    const alreadyCompleted = { success: true as const, data: { messageSent: false, alreadyCompleted: true } };
    if (session.status === "COMPLETED") return alreadyCompleted;

    const { completed } = await finalizeSessionCompletion(
      dbUser,
      {
        id: sessionId,
        scheduledDate: session.scheduledDate,
        startedAt: session.startedAt,
        workoutName: session.workout.name,
      },
      {
        overallNotes: comment ?? undefined,
        feelingRating: feelingRating ?? null,
        watchedSeconds,
        durationMinutes: watchedSecondsToMinutes(watchedSeconds),
      },
      { onlyIfNotCompleted: true }
    );
    if (!completed) return alreadyCompleted;

    if (feelingRating || comment) {
      await logUserAudit(dbUser, () => ({
        action: AUDIT_ACTIONS.WORKOUT_FEEDBACK_SUBMITTED,
        targetType: "WorkoutSession",
        targetId: sessionId,
        targetLabel: session.workout.name,
        metadata: { ...(feelingRating && { feelingRating }), hasComment: !!comment },
      }));
    }

    // The session is already complete; a failed message must not undo that.
    let messageSent = false;
    if (comment) {
      try {
        messageSent = await sendFollowAlongFeedbackMessage(dbUser, {
          sessionId,
          comment,
          feelingRating: feelingRating ?? null,
          workout: session.workout,
        });
      } catch (messageErr) {
        console.error("Follow-along feedback message failed (non-fatal):", messageErr);
      }
    }

    return { success: true as const, data: { messageSent, alreadyCompleted: false } };
  } catch (error) {
    console.error(error);
    return { success: false as const, error: "Failed to complete session" };
  }
}

/**
 * Sends the follow-along comment to the trainer who owns the program (not just
 * any trainer in the org); false when messaging is off, the program has no
 * trainer, or the pair rule (club coaching) doesn't let them interact.
 */
async function sendFollowAlongFeedbackMessage(
  dbUser: CompletingClient,
  input: {
    sessionId: string;
    comment: string;
    feelingRating: string | null;
    workout: {
      name: string;
      weekIndex: number;
      dayIndex: number;
      program: {
        trainerId: string | null;
        contentFormat: string | null;
        durationWeeks: number | null;
        workouts: { weekIndex: number; dayIndex: number }[];
      };
    };
  }
): Promise<boolean> {
  const caps = await getCapabilitiesForUser(dbUser);
  if (!caps.messaging) return false;
  const { workout } = input;
  const trainerId = workout.program.trainerId;
  if (!trainerId) return false;
  if (!(await canCoachInteract(dbUser, trainerId))) return false;

  const excerptParts: string[] = [];
  const feelingLabel = getFeelingLabel(input.feelingRating);
  if (feelingLabel) excerptParts.push(`Felt: ${feelingLabel}`);
  if (isFollowAlongProgram(workout.program)) {
    excerptParts.push(
      formatDayOfTotal(
        dayNumberFromIndices(workout.weekIndex, workout.dayIndex),
        getFollowAlongTotalDays(workout.program.workouts, workout.program.durationWeeks)
      )
    );
  }

  await sendContextMessageToTrainer({
    client: { id: dbUser.id, firstName: dbUser.firstName, lastName: dbUser.lastName },
    trainerId,
    content: input.comment,
    context: {
      kind: "WORKOUT_FEEDBACK",
      refId: input.sessionId,
      title: workout.name,
      excerpt: excerptParts.join(" · ") || null,
    },
  });
  return true;
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
    const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
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
