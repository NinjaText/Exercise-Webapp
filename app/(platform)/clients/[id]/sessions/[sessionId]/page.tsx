import { notFound } from "next/navigation";
import { format } from "date-fns";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/current-user";
import { Clock, Dumbbell, Gauge, ListChecks, PlayCircle, Smile, StickyNote, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { ClientNoteReply } from "@/components/sessions/client-note-reply";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import { formatDuration, getFeelingLabel, isVideoWorkout } from "@/lib/utils/follow-along";

// ---------- Types derived from the Prisma query ----------

type SessionWithRelations = NonNullable<
  Awaited<ReturnType<typeof fetchSession>>
>;
type Block = SessionWithRelations["workout"]["blocks"][number];
type BlockExercise = Block["exercises"][number];
type ExerciseSet = BlockExercise["sets"][number];
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

function isCouldntComplete(log: SetLog): boolean {
  return log.actualReps === 0 && log.actualDuration == null;
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
  // Follow-along video day: no exercises to review — show the client's
  // "How did it go?" answer and how much they watched instead.
  const isVideo = isVideoWorkout(session.workout);
  const feelingLabel = getFeelingLabel(session.feelingRating);

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
            {feelingLabel && (
              <StatusBadge status="feeling" role="brand" dot={false} label={`Felt: ${feelingLabel}`} />
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

      {isVideo ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard size="compact" label="Felt" value={feelingLabel ?? "—"} icon={Smile} role="info" />
          <StatCard
            size="compact"
            label="Watched"
            value={formatDuration(session.watchedSeconds) ?? "—"}
            icon={PlayCircle}
            role="success"
          />
          <StatCard
            size="compact"
            label="Video length"
            value={formatDuration(session.workout.videoDurationSec) ?? "—"}
            icon={Clock}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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
      )}

      {session.overallNotes && (
        <SectionCard title={isVideo ? "Client comment" : "Session notes"} icon={StickyNote}>
          <p className="whitespace-pre-wrap text-body text-foreground">{session.overallNotes}</p>
        </SectionCard>
      )}

      {isVideo && session.workout.videoUrl && (
        <SectionCard title="Follow-along video" icon={PlayCircle} contentClassName="space-y-3">
          <UniversalVideoPlayer url={session.workout.videoUrl} className="max-w-2xl" />
          {session.workout.description && (
            <p className="whitespace-pre-wrap text-body text-muted-foreground">{session.workout.description}</p>
          )}
        </SectionCard>
      )}

      {session.workout.blocks.map((block) => (
        <section key={block.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="min-w-0 break-words text-heading text-foreground">{block.name || block.type}</h2>
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
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
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
                  <SetTable block={block} exercise={exercise} setCount={setCount} setLogs={setLogs} />
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

function SetTable({
  block,
  exercise,
  setCount,
  setLogs,
}: {
  block: Block;
  exercise: BlockExercise;
  setCount: number;
  setLogs: SetLog[];
}) {
  const isCircuit = isCircuitBlock(block.type);
  const indexLabel = isCircuit ? "Round" : "Set";

  // Map setLogs by setIndex for O(1) lookup. setIndex is 0-based.
  const logByIndex = new Map<number, SetLog>();
  for (const log of setLogs) logByIndex.set(log.setIndex, log);

  // Build rows for indices 0..setCount-1
  const rows = Array.from({ length: setCount }, (_, i) => {
    const exerciseSet: ExerciseSet | undefined = exercise.sets[i];
    const log = logByIndex.get(i);
    return { index: i, exerciseSet, log };
  });

  // Below 640px each set becomes a small labelled card (same DOM, `max-sm:`
  // restyle): "Set 1" + status on top, target/actual/weight underneath.
  return (
    <div className="sm:overflow-x-auto">
      <table className="w-full text-body max-sm:block">
        <thead className="bg-surface-muted text-caption font-medium max-sm:sr-only">
          <tr>
            <th className="h-9 px-5 text-left font-medium">#</th>
            <th className="h-9 px-3 text-left font-medium">Target</th>
            <th className="h-9 px-3 text-left font-medium">Actual</th>
            <th className="h-9 px-3 text-left font-medium">Weight</th>
            <th className="h-9 px-5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {rows.map(({ index, exerciseSet, log }) => (
            <SetRow
              key={index}
              indexLabel={indexLabel}
              displayIndex={index + 1}
              exerciseSet={exerciseSet}
              log={log}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phone card field: caption label (from data-label) stacked over the value. */
const SET_FIELD_PHONE =
  "max-sm:flex max-sm:flex-col max-sm:gap-0.5 max-sm:p-0 max-sm:before:text-caption max-sm:before:font-medium max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]";

function SetRow({
  indexLabel,
  displayIndex,
  exerciseSet,
  log,
}: {
  indexLabel: string;
  displayIndex: number;
  exerciseSet: ExerciseSet | undefined;
  log: SetLog | undefined;
}) {
  // ---- Target column ----
  const targetText = exerciseSet
    ? exerciseSet.targetReps != null
      ? `${exerciseSet.targetReps} reps`
      : exerciseSet.targetDuration != null
      ? `${exerciseSet.targetDuration}s`
      : "—"
    : "—";

  // ---- Actual column ----
  let actualText = "—";
  if (log) {
    if (log.actualReps != null && log.actualReps > 0) {
      actualText = String(log.actualReps);
    } else if (log.actualDuration != null) {
      actualText = `${log.actualDuration}s`;
    } else if (log.actualReps === 0) {
      actualText = "0";
    }
  }

  // ---- Weight column ----
  const weightText =
    log && log.actualWeight != null ? `${log.actualWeight} lbs` : "—";

  // ---- Status badge ----
  let statusBadge: React.ReactNode;
  let noteText: string | null = null;
  if (!log) {
    statusBadge = <StatusBadge status="not-logged" role="neutral" size="sm" label="Not logged" />;
  } else if (isCouldntComplete(log)) {
    statusBadge = (
      <StatusBadge status="couldnt-complete" role="warning" size="sm" label="Couldn't complete" />
    );
    if (log.notes) noteText = log.notes;
  } else {
    statusBadge = <StatusBadge status="done" role="success" size="sm" label="Done" />;
  }

  return (
    <tr className="border-t border-border max-sm:grid max-sm:grid-cols-3 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-4 max-sm:py-3 max-sm:first:border-t-0">
      <td className="px-5 py-2.5 font-medium text-foreground tabular-nums max-sm:self-center max-sm:p-0">
        {indexLabel} {displayIndex}
      </td>
      <td data-label="Target" className={cn("px-3 py-2.5 text-muted-foreground tabular-nums", SET_FIELD_PHONE)}>{targetText}</td>
      <td data-label="Actual" className={cn("px-3 py-2.5 text-foreground tabular-nums", SET_FIELD_PHONE)}>{actualText}</td>
      <td data-label="Weight" className={cn("px-3 py-2.5 text-muted-foreground tabular-nums", SET_FIELD_PHONE)}>{weightText}</td>
      <td className="px-5 py-2.5 max-sm:col-span-2 max-sm:col-start-2 max-sm:row-start-1 max-sm:p-0">
        <div className="flex flex-col gap-1 max-sm:items-end max-sm:text-right">
          {statusBadge}
          {noteText && (
            <span className="text-caption">{noteText}</span>
          )}
        </div>
      </td>
    </tr>
  );
}
