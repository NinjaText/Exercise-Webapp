import { notFound } from "next/navigation";
import { format } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/current-user";
import { Dumbbell, Gauge, ListChecks, StickyNote, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { ClientNoteReply } from "@/components/sessions/client-note-reply";
import {
  SessionReviewSets,
  buildSetReviewRows,
  isCouldntComplete,
} from "@/components/sessions/session-review-sets";

// ---------- Types derived from the Prisma query ----------

type SessionWithRelations = NonNullable<
  Awaited<ReturnType<typeof fetchSession>>
>;
type Block = SessionWithRelations["workout"]["blocks"][number];
type BlockExercise = Block["exercises"][number];
type ExerciseLog = SessionWithRelations["exerciseLogs"][number];
type SetLog = ExerciseLog["setLogs"][number];

// ---------- Constants ----------

const CIRCUIT_TYPES = new Set(["CIRCUIT", "SUPERSET", "WARMUP", "COOLDOWN"]);

// ---------- Helpers ----------

function isCircuitBlock(type: string): boolean {
  return CIRCUIT_TYPES.has(type.toUpperCase());
}

function getSetCount(block: Block, exercise: BlockExercise): number {
  return isCircuitBlock(block.type)
    ? Math.max(1, block.rounds ?? 1)
    : exercise.sets.length;
}

function getExerciseCompletion(
  setCount: number,
  setLogs: SetLog[]
): "all" | "partial" | "none" {
  if (setLogs.length === 0) return "none";
  if (setLogs.length >= setCount) return "all";
  return "partial";
}

// ---------- Data fetching ----------

async function fetchSession(sessionId: string) {
  return prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      client: { select: { firstName: true, lastName: true } },
      workout: {
        include: {
          program: { select: { trainerId: true, name: true } },
          blocks: {
            orderBy: { orderIndex: "asc" },
            include: {
              exercises: {
                orderBy: { orderIndex: "asc" },
                include: {
                  exercise: { select: { name: true } },
                  sets: { orderBy: { orderIndex: "asc" } },
                },
              },
            },
          },
        },
      },
      exerciseLogs: {
        include: { setLogs: true },
      },
    },
  });
}

// ---------- Page ----------

interface Props {
  params: Promise<{ id: string; sessionId: string }>;
}

export default async function SessionReviewPage({ params }: Props) {
  const { id, sessionId } = await params;
  const user = await requireRole("TRAINER");

  const session = await fetchSession(sessionId);
  if (!session) notFound();

  // Authorization: session must belong to this client AND this trainer must
  // own the program. Either failure → 404 (avoid leaking existence).
  if (session.clientId !== id) notFound();
  if (session.workout.program.trainerId !== user.id) notFound();

  // Build a lookup from blockExerciseId → setLogs for O(1) access in render.
  const setLogsByBlockExerciseId = new Map<string, SetLog[]>();
  const clientNoteByBlockExerciseId = new Map<string, string>();
  for (const log of session.exerciseLogs) {
    setLogsByBlockExerciseId.set(
      log.blockExerciseId,
      [...log.setLogs].sort((a, b) => a.setIndex - b.setIndex)
    );
    if (log.clientNote) clientNoteByBlockExerciseId.set(log.blockExerciseId, log.clientNote);
  }

  // Summary stats
  const totalExercises = session.workout.blocks.reduce(
    (acc, b) => acc + b.exercises.length,
    0
  );
  const allSetLogs = session.exerciseLogs.flatMap((l) => l.setLogs);
  const setsLogged = allSetLogs.length;
  const couldntComplete = allSetLogs.filter(isCouldntComplete).length;

  const clientName = `${session.client.firstName} ${session.client.lastName}`;

  return (
    <PageShell>
      <PageHeader
        back={{ label: "Back to sessions", href: `/clients/${id}/adherence` }}
        breadcrumb={[
          { label: "Clients", href: "/clients" },
          { label: clientName, href: `/clients/${id}` },
          { label: "Sessions", href: `/clients/${id}/adherence` },
          { label: session.workout.name },
        ]}
        title={session.workout.name}
        description={clientName}
        meta={
          <>
            <span className="tabular-nums">
              {format(toLocalCalendarDate(session.scheduledDate), "MMM d, yyyy")}
            </span>
            <StatusBadge status={session.status} />
            {session.overallRPE != null && (
              <StatusBadge status="rpe" role="brand" dot={false} label={`RPE ${session.overallRPE}`} />
            )}
            {session.durationMinutes != null && (
              <StatusBadge
                status="duration"
                role="neutral"
                dot={false}
                label={`${session.durationMinutes} min`}
              />
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard size="compact" label="Exercises" value={totalExercises} icon={Dumbbell} />
        <StatCard size="compact" label="Sets logged" value={setsLogged} icon={ListChecks} role="success" />
        <StatCard
          size="compact"
          label="Couldn't complete"
          value={couldntComplete}
          icon={TriangleAlert}
          role={couldntComplete > 0 ? "warning" : "neutral"}
        />
        <StatCard size="compact" label="Overall RPE" value={session.overallRPE ?? "—"} icon={Gauge} />
      </div>

      {session.overallNotes && (
        <SectionCard title="Session notes" icon={StickyNote}>
          <p className="whitespace-pre-wrap text-body text-foreground">{session.overallNotes}</p>
        </SectionCard>
      )}

      {session.workout.blocks.map((block) => (
        <section key={block.id} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-heading text-foreground">{block.name || block.type}</h2>
            {isCircuitBlock(block.type) && (
              <span className="text-caption tabular-nums">· {block.rounds ?? 1} rounds</span>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {block.exercises.map((exercise) => {
              const setCount = getSetCount(block, exercise);
              const setLogs = setLogsByBlockExerciseId.get(exercise.id) ?? [];
              const completion = getExerciseCompletion(setCount, setLogs);
              const clientNote = clientNoteByBlockExerciseId.get(exercise.id);

              return (
                // Edge-to-edge card: the header carries its own padding and the
                // set table runs flush to the card edges.
                <Card key={exercise.id} className="gap-0 py-0">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                    <h3 className="truncate text-heading text-foreground">{exercise.exercise.name}</h3>
                    <CompletionBadge completion={completion} />
                  </div>
                  {clientNote && (
                    <ClientNoteReply
                      sessionId={session.id}
                      blockExerciseId={exercise.id}
                      clientNote={clientNote}
                      clientFirstName={session.client.firstName}
                    />
                  )}
                  <SessionReviewSets
                    rows={buildSetReviewRows({
                      isCircuit: isCircuitBlock(block.type),
                      setCount,
                      exerciseSets: exercise.sets,
                      setLogs,
                    })}
                  />
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </PageShell>
  );
}

// ---------- Sub-components ----------

function CompletionBadge({ completion }: { completion: "all" | "partial" | "none" }) {
  if (completion === "all") return <StatusBadge status="all" role="success" label="All done" />;
  if (completion === "partial") return <StatusBadge status="partial" role="warning" label="Partial" />;
  return <StatusBadge status="none" role="neutral" label="Not started" />;
}
