import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { Mic } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { WorkoutModeWrapper } from "@/components/workout/workout-mode-wrapper";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { FollowAlongSession } from "@/components/workout/follow-along/follow-along-session";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import {
  isVideoWorkout,
  isFollowAlongProgram,
  dayNumberFromIndices,
  getFollowAlongTotalDays,
} from "@/lib/utils/follow-along";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  const user = await getCurrentUser();

  const session = await prisma.workoutSessionV2.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      workout: {
        include: {
          program: {
            include: {
              trainer: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          blocks: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              type: true,
              rounds: true,
              restBetweenRounds: true,
              name: true,
              orderIndex: true,
              exercises: {
                orderBy: { orderIndex: "asc" },
                include: {
                  exercise: {
                    include: { media: true }
                  },
                  sets: {
                    orderBy: { orderIndex: "asc" }
                  }
                }
              }
            }
          }
        }
      },
      exerciseLogs: {
        include: {
          setLogs: true
        }
      }
    }
  });

  if (!session) return notFound();

  const voiceMemoResult = await getWorkoutVoiceMemos(session.workoutId);
  const trainerMemo = voiceMemoResult.data?.trainer ?? null;
  const clientMemo = voiceMemoResult.data?.client ?? null;

  const isClientOwner = session.clientId === user.id;
  const isProgramTrainer = session.workout.program.trainerId === user.id;

  if (!isClientOwner && !isProgramTrainer) return redirect("/dashboard");

  const workoutName = session.workout.name;
  const description = `${session.workout.program.name} · ${format(toLocalCalendarDate(session.scheduledDate), "MMM d, yyyy")}`;
  const trainerName =
    [session.workout.program.trainer?.firstName, session.workout.program.trainer?.lastName]
      .filter(Boolean)
      .join(" ") || null;

  // A follow-along video day replaces the exercise tracker entirely.
  if (isVideoWorkout(session.workout) && session.workout.videoUrl) {
    const isFollowAlong = isFollowAlongProgram(session.workout.program);
    const [programWorkouts, caps] = await Promise.all([
      isFollowAlong
        ? prisma.workout.findMany({
            where: { programId: session.workout.programId },
            select: { weekIndex: true, dayIndex: true },
          })
        : Promise.resolve([]),
      isClientOwner ? getCapabilitiesForUser(user) : Promise.resolve(null),
    ]);

    return (
      <PageShell width="narrow">
        <PageHeader
          back={{ label: "Back to dashboard", href: "/dashboard" }}
          breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: workoutName }]}
          title={workoutName}
          description={description}
        />
        <FollowAlongSession
          session={{
            id: session.id,
            status: session.status,
            feelingRating: session.feelingRating,
            overallNotes: session.overallNotes,
          }}
          workout={{
            name: workoutName,
            description: session.workout.description,
            videoUrl: session.workout.videoUrl,
            videoDurationSec: session.workout.videoDurationSec,
          }}
          dayNumber={isFollowAlong ? dayNumberFromIndices(session.workout.weekIndex, session.workout.dayIndex) : null}
          totalDays={isFollowAlong ? getFollowAlongTotalDays(programWorkouts, session.workout.program.durationWeeks) : null}
          trainerName={trainerName}
          canStart={isClientOwner}
          canMessageTrainer={!!caps?.messaging}
        />
      </PageShell>
    );
  }

  return (
    // Wider than "narrow" so the guided workout can sit its video beside the
    // set log and fit one screen; capped so checklist rows don't stretch.
    <PageShell width="narrow" className="max-w-5xl">
      <PageHeader
        back={{ label: "Back to dashboard", href: "/dashboard" }}
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: workoutName }]}
        title={workoutName}
        description={description}
      />
      {(trainerMemo || clientMemo) && (
        <SectionCard title="Voice notes" icon={Mic} size="compact" contentClassName="space-y-2">
            {trainerMemo && (
              <VoiceMemoPlayer
                memo={trainerMemo}
                authorName={trainerName ?? "Trainer"}
              />
            )}
            {clientMemo && (
              <VoiceMemoPlayer
                memo={clientMemo}
                authorName={
                  [session.client?.firstName, session.client?.lastName]
                    .filter(Boolean)
                    .join(" ") || "Client"
                }
              />
            )}
        </SectionCard>
      )}
      <WorkoutModeWrapper
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the wrapper takes the raw include and each tracker narrows it
        session={session as any}
        initialMode={mode === "checklist" || mode === "session" ? mode : undefined}
      />
    </PageShell>
  );
}
