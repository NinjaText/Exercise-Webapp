/**
 * Data for the Client Progress Overview.
 *
 * The computation half is pure and exported for unit testing; the Prisma
 * access sits at the bottom of the file. The MVP deliberately omits total
 * volume, total reps, session duration and readiness — see the spec.
 */

export interface ProgressSession {
  status: string;
  scheduledDate: Date;
  completedAt: Date | null;
  workoutName: string | null;
}

export interface PainPoint {
  value: number;
  recordedAt: Date;
}

export interface CompletionSummary {
  completed: number;
  scheduled: number;
  percent: number;
  /** Percentage-point change vs. the previous equal-length period; null when there is no prior data. */
  changeVsPrevious: number | null;
}

export interface PainSummary {
  baseline: number | null;
  latest: number | null;
  /** Percent change from baseline to latest; null when fewer than two points. */
  percentChange: number | null;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function percentOf(completed: number, scheduled: number): number {
  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

export function computeCompletion(
  current: ProgressSession[],
  previous: ProgressSession[]
): CompletionSummary {
  const completed = current.filter((s) => s.status === "COMPLETED").length;
  const scheduled = current.length;
  const percent = percentOf(completed, scheduled);

  let changeVsPrevious: number | null = null;
  if (previous.length > 0) {
    const prevPercent = percentOf(
      previous.filter((s) => s.status === "COMPLETED").length,
      previous.length
    );
    changeVsPrevious = percent - prevPercent;
  }

  return { completed, scheduled, percent, changeVsPrevious };
}

export function computePainSummary(points: PainPoint[]): PainSummary {
  if (points.length === 0) {
    return { baseline: null, latest: null, percentChange: null };
  }

  const sorted = [...points].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
  );
  const baseline = sorted[0].value;
  const latest = sorted[sorted.length - 1].value;

  // A single reading has no trend, and a zero baseline makes percent change
  // meaningless (divide by zero) rather than infinite.
  const percentChange =
    sorted.length < 2 || baseline === 0
      ? null
      : Math.round(((latest - baseline) / baseline) * 100);

  return { baseline, latest, percentChange };
}

export function filterPainPointsByWeeks(
  points: PainPoint[],
  weeks: number,
  now: Date
): PainPoint[] {
  const cutoff = now.getTime() - weeks * 7 * DAY_MS;
  return points.filter((p) => p.recordedAt.getTime() >= cutoff);
}

export function pickRecentActivity(
  sessions: ProgressSession[],
  limit: number
): ProgressSession[] {
  return sessions
    .filter((s) => s.status === "COMPLETED" || s.status === "MISSED")
    .sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime())
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Prisma access
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SCHEDULED_PROGRAM_WHERE } from "@/lib/services/dashboard-insights.service";

export interface ClientProgressNote {
  text: string;
  author: string;
  createdAt: Date;
  context: string | null;
}

export interface ClientProgressReport {
  completion: CompletionSummary;
  pain: PainSummary;
  painPoints: PainPoint[];
  recentActivity: ProgressSession[];
  notes: ClientProgressNote[];
}

const sessionSelect = {
  status: true,
  scheduledDate: true,
  completedAt: true,
  workout: { select: { name: true } },
} satisfies Prisma.WorkoutSessionV2Select;

type SessionRow = Prisma.WorkoutSessionV2GetPayload<{ select: typeof sessionSelect }>;

function toProgressSessions(rows: SessionRow[]): ProgressSession[] {
  return rows.map((r) => ({
    status: r.status,
    scheduledDate: r.scheduledDate,
    completedAt: r.completedAt,
    workoutName: r.workout?.name ?? null,
  }));
}

/**
 * Loads everything the Client Progress Overview needs for one client and
 * date range.
 *
 * Client Notes — Ruling R8: `SessionFeedback` is never written by any live
 * flow in this app (`submitSessionFeedback` has no callers), so it cannot be
 * the only source or the panel would always be empty. `notes` merges three
 * client-authored sources instead:
 *   - `SessionExerciseLog.clientNote` — a note against one exercise
 *   - `WorkoutSessionV2.overallNotes` — a note about the whole session
 *   - `SessionFeedback.comment` — kept so the panel starts working on its own
 *     if that flow is ever wired up
 * `ClinicalNote` (the trainer's SOAP note) must never appear here.
 */
export async function getClientProgressReport(
  clientId: string,
  range: { from: Date; to: Date }
): Promise<ClientProgressReport> {
  const spanMs = range.to.getTime() - range.from.getTime();
  const prevFrom = new Date(range.from.getTime() - spanMs);

  const [
    currentRows,
    previousRows,
    painRows,
    exerciseNoteRows,
    overallNoteRows,
    feedbackRows,
  ] = await Promise.all([
    prisma.workoutSessionV2.findMany({
      where: {
        clientId,
        scheduledDate: { gte: range.from, lte: range.to },
        workout: { program: SCHEDULED_PROGRAM_WHERE },
      },
      select: sessionSelect,
      orderBy: { scheduledDate: "desc" },
    }),
    prisma.workoutSessionV2.findMany({
      where: {
        clientId,
        scheduledDate: { gte: prevFrom, lt: range.from },
        workout: { program: SCHEDULED_PROGRAM_WHERE },
      },
      select: sessionSelect,
    }),
    // Pain is a client-self-reported Assessment, not a session field. No
    // `take` limit — the trend chart applies its own 4W/8W/12W window
    // client-side and needs the full series.
    prisma.assessment.findMany({
      where: { clientId, assessmentType: "pain_level" },
      select: { value: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    // Client note against one exercise in a session (R8, source 1 of 3).
    prisma.sessionExerciseLog.findMany({
      where: {
        clientNote: { not: null },
        session: { clientId, scheduledDate: { gte: range.from, lte: range.to } },
      },
      select: {
        clientNote: true,
        completedAt: true,
        blockExerciseId: true,
        session: { select: { scheduledDate: true } },
      },
    }),
    // Client note about the whole session, written on completion (R8, source 2 of 3).
    // Constrained to scheduled-program sessions to match its sibling completion
    // queries above — On-Demand "Resource" sessions are deliberately excluded here.
    prisma.workoutSessionV2.findMany({
      where: {
        clientId,
        overallNotes: { not: null },
        scheduledDate: { gte: range.from, lte: range.to },
        workout: { program: SCHEDULED_PROGRAM_WHERE },
      },
      select: { overallNotes: true, completedAt: true, scheduledDate: true },
    }),
    // Kept as a third source so this starts working by itself if that flow
    // is ever wired up (R8, source 3 of 3) — must not be the only source.
    prisma.sessionFeedback.findMany({
      where: { clientId, comment: { not: null }, createdAt: { gte: range.from, lte: range.to } },
      select: { comment: true, rating: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const current = toProgressSessions(currentRows);

  // Every pain point ever logged — the trend chart applies its own 4W/8W/12W
  // window client-side, independent of the header's date range.
  const painPoints: PainPoint[] = painRows.map((p) => ({
    value: p.value,
    recordedAt: p.createdAt,
  }));

  // The summary's baseline is the earliest point INSIDE the selected range,
  // per the spec — not the earliest ever, which would report a baseline from
  // outside the period the trainer is looking at.
  const painInRange = painPoints.filter(
    (p) => p.recordedAt >= range.from && p.recordedAt <= range.to
  );

  // Resolve exercise names cheaply for exercise-note context: one batched
  // lookup rather than N+1 queries.
  const blockExerciseIds = Array.from(
    new Set(exerciseNoteRows.map((r) => r.blockExerciseId))
  );
  const blockExercises = blockExerciseIds.length
    ? await prisma.blockExerciseV2.findMany({
        where: { id: { in: blockExerciseIds } },
        select: { id: true, exercise: { select: { name: true } } },
      })
    : [];
  const exerciseNameById = new Map(
    blockExercises.map((b) => [b.id, b.exercise?.name ?? null])
  );

  const exerciseNotes: ClientProgressNote[] = exerciseNoteRows.map((r) => ({
    text: r.clientNote as string,
    author: "client",
    createdAt: r.completedAt ?? r.session.scheduledDate,
    context: exerciseNameById.get(r.blockExerciseId) ?? "Exercise note",
  }));

  const overallNotes: ClientProgressNote[] = overallNoteRows.map((r) => ({
    text: r.overallNotes as string,
    author: "client",
    createdAt: r.completedAt ?? r.scheduledDate,
    context: "Session note",
  }));

  const feedbackNotes: ClientProgressNote[] = feedbackRows.map((f) => ({
    text: f.comment as string,
    author: "client",
    createdAt: f.createdAt,
    context: f.rating,
  }));

  const notes = [...exerciseNotes, ...overallNotes, ...feedbackNotes].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return {
    completion: computeCompletion(current, toProgressSessions(previousRows)),
    pain: computePainSummary(painInRange),
    painPoints,
    recentActivity: pickRecentActivity(current, 5),
    notes,
  };
}
