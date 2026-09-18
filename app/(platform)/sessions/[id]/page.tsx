import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { Card, CardContent } from "@/components/ui/card";
import { WorkoutModeWrapper } from "@/components/workout/workout-mode-wrapper";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";

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

  return (
    <PageShell width="full">
      <PageHeader
        back={{ label: "Back to dashboard", href: "/dashboard" }}
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: workoutName }]}
        title={workoutName}
        description={description}
      />
      {(trainerMemo || clientMemo) && (
        <Card>
          <CardContent className="space-y-2 p-4 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Voice Notes
            </p>
            {trainerMemo && (
              <VoiceMemoPlayer
                memo={trainerMemo}
                authorName={
                  [
                    session.workout.program.trainer?.firstName,
                    session.workout.program.trainer?.lastName,
                  ]
                    .filter(Boolean)
                    .join(" ") || "Trainer"
                }
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
          </CardContent>
        </Card>
      )}
      <WorkoutModeWrapper
        session={session as any}
        initialMode={mode === "checklist" || mode === "session" ? mode : undefined}
      />
    </PageShell>
  );
}
