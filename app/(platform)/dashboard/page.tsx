import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { TrainerDashboard } from "@/components/dashboard/trainer-dashboard";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import * as sessionService from "@/lib/services/session.service";
import * as messageService from "@/lib/services/message.service";
import * as programService from "@/lib/services/program.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import {
  getDashboardInsights,
  computeProgramWeek,
} from "@/lib/services/dashboard-insights.service";
import { computeCurrentStreak } from "@/lib/utils/streak";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";
import type { TrainerMessagePreview } from "@/components/dashboard/trainer-message-banner";
import type { ProgramProgressSummary } from "@/components/dashboard/program-progress-bar";
import type { QuickResourceItem } from "@/components/dashboard/quick-resources-row";
import { startOfWeek, endOfWeek, startOfDay } from "date-fns";

/** How many Resource cards the dashboard's quick-access row shows. */
const MAX_DASHBOARD_RESOURCES = 3;

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);

  if (user.role === "TRAINER") {
    // The trainer dashboard renders a Mon–Sun status strip per client, so its
    // session window must be a Monday-start week. The client dashboard's
    // weekStart/weekEnd above stay locale-default and are untouched.
    const trainerWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const trainerWeekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const [
      clientIds,
      activePlans,
      pendingFeedback,
      unreadMessages,
      activePrograms,
      upcomingSessions,
      insights,
      inboxThreads,
    ] = await Promise.all([
      getClientIdsForTrainer(user.id),
      prisma.workoutPlan.count({
        where: { createdById: user.id, status: "ACTIVE" },
      }),
      prisma.exerciseFeedback.count({
        where: {
          trainerResponse: null,
          planExercise: { plan: { createdById: user.id } },
        },
      }),
      prisma.message.count({
        where: { recipientId: user.id, isRead: false },
      }),
      prisma.program.count({
        where: { trainerId: user.id, status: "ACTIVE" },
      }),
      sessionService.getSessionsForTrainer(user.id, {
        from: trainerWeekStart,
        to: trainerWeekEnd,
      }),
      getDashboardInsights(user.id, now),
      messageService.getInboxThreads(user.id),
    ]);

    // Resources have no schedule, so a lazily-created resource session must
    // never show up in the week's workout plan alongside scheduled work.
    const scheduledSessions = upcomingSessions.filter(
      (session) =>
        getProgramSchedulingType({
          schedulingType: session.workout?.program?.schedulingType ?? null,
        }) === "SCHEDULED"
    );

    return (
      <TrainerDashboard
        clientCount={clientIds.length}
        activePlans={activePlans}
        pendingFeedback={pendingFeedback}
        unreadMessages={unreadMessages}
        activePrograms={activePrograms}
        upcomingSessions={scheduledSessions}
        priorities={insights.priorities}
        clientsNeedingAttention={insights.clientsNeedingAttention}
        sessionsDueToday={insights.sessionsDueToday}
        clientMetrics={insights.clientMetrics}
        recentMessages={inboxThreads.slice(0, 5)}
        clientProgress={insights.clientProgress}
      />
    );
  }

  // Client dashboard
  const calendarWindow = sessionService.getClientCalendarWindow(now);

  const [
    recentAssessments,
    calendarSessions,
    completedThisWeek,
    completedSessionDates,
    exercisesCompleted,
    inboxThreads,
    assignedPrograms,
  ] = await Promise.all([
    prisma.assessment.findMany({
      where: { clientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    sessionService.getClientCalendarSessions(user.id, calendarWindow),
    prisma.workoutSessionV2.count({
      where: {
        clientId: user.id,
        status: "COMPLETED",
        completedAt: { gte: weekStart, lte: weekEnd },
      },
    }),
    prisma.workoutSessionV2.findMany({
      where: { clientId: user.id, status: "COMPLETED" },
      select: { startedAt: true, completedAt: true },
    }),
    prisma.sessionExerciseLog.count({
      where: { session: { clientId: user.id }, status: "COMPLETED" },
    }),
    messageService.getInboxThreads(user.id),
    programService.getProgramsForClient(user.id),
  ]);

  // --- Trainer message banner -------------------------------------------
  // Only an *unread* thread from the trainer side warrants interrupting the
  // dashboard; anything else stays in the Inbox.
  const unreadTrainerThread =
    inboxThreads.find((t) => t.otherUser.role === "TRAINER" && t.unreadCount > 0) ?? null;
  const unreadTrainerMessage: TrainerMessagePreview | null = unreadTrainerThread
    ? {
        trainerId: unreadTrainerThread.otherUser.id,
        trainerName:
          `${unreadTrainerThread.otherUser.firstName} ${unreadTrainerThread.otherUser.lastName}`.trim() ||
          "Your trainer",
        preview: unreadTrainerThread.lastMessage.content,
        sentAt: unreadTrainerThread.lastMessage.createdAt,
        unreadCount: unreadTrainerThread.unreadCount,
      }
    : null;

  // --- Program progress vs. Resources -----------------------------------
  // A Resource has no schedule, so it can never be "the program you're on" —
  // the progress card must pick a Scheduled one.
  const scheduledPrograms = assignedPrograms.filter(
    (p) => getProgramSchedulingType(p) === "SCHEDULED"
  );
  const currentProgram = scheduledPrograms.find((p) => p.status === "ACTIVE") ?? null;
  const progressByProgramId = currentProgram
    ? await programService.getProgramProgressMap([currentProgram.id])
    : {};
  const currentProgramProgress = currentProgram ? progressByProgramId[currentProgram.id] : undefined;

  const programProgress: ProgramProgressSummary | null = currentProgram
    ? {
        programId: currentProgram.id,
        programName: currentProgram.name,
        week: computeProgramWeek(
          {
            id: currentProgram.id,
            name: currentProgram.name,
            startDate: currentProgram.startDate,
            durationWeeks: currentProgram.durationWeeks,
          },
          now
        ),
        completedSessions: currentProgramProgress?.completed ?? 0,
        totalSessions: currentProgramProgress?.total ?? 0,
      }
    : null;

  const resources: QuickResourceItem[] = assignedPrograms
    .filter((p) => getProgramSchedulingType(p) === "ON_DEMAND")
    .slice(0, MAX_DASHBOARD_RESOURCES)
    .map((p) => ({
      id: p.id,
      name: p.name,
      workoutCount: p._count.workouts,
      // Resources are usually a single routine, so the program's own duration
      // isn't meaningful — there's no per-workout estimate in this list query.
      estimatedMinutes: null,
      tags: p.tags,
      activities: p.activities,
      goals: p.goals,
      bodyAreas: p.bodyAreas,
    }));

  // The hero "next workout" uses the first upcoming session
  const upcomingSessions = calendarSessions.filter(
    (s) => (s.status === "SCHEDULED" || s.status === "IN_PROGRESS") && new Date(s.scheduledDate) >= startOfDay(now)
  );

  const currentStreak = computeCurrentStreak(
    completedSessionDates.map((s) => s.completedAt ?? new Date()).filter(Boolean) as Date[],
    now
  );
  const minutesExercised = Math.round(
    completedSessionDates.reduce((total, s) => {
      if (!s.startedAt || !s.completedAt) return total;
      return total + (s.completedAt.getTime() - s.startedAt.getTime()) / 60000;
    }, 0)
  );
  const workoutsCompleted = completedSessionDates.length;

  return (
    <ClientDashboard
      firstName={user.firstName}
      upcomingSessions={upcomingSessions}
      calendarSessions={calendarSessions}
      weeklyCompliance={completedThisWeek}
      recentAssessments={recentAssessments}
      currentStreak={currentStreak}
      workoutsCompleted={workoutsCompleted}
      exercisesCompleted={exercisesCompleted}
      minutesExercised={minutesExercised}
      unreadTrainerMessage={unreadTrainerMessage}
      programProgress={programProgress}
      resources={resources}
    />
  );
}
