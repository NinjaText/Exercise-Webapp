import type { Reflection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";
import { MAX_FANOUT_ROWS, MAX_PROGRAM_PLAN_DAYS, type ReflectionKind } from "@/lib/reflections/constants";
import { toUtcDay, utcDaysBetween } from "@/lib/reflections/dates";
import { getLibraryReflectionForDate } from "@/lib/reflections/library";
import { getTrainersForClient } from "@/lib/services/client.service";
import type { ReflectionContentInput } from "@/lib/validators/reflection";

// ─── Errors ──────────────────────────────────────────────────────────────────

export type ReflectionErrorCode = "too_many_rows" | "no_targets" | "program_not_found";

export class ReflectionError extends Error {
  constructor(public code: ReflectionErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ReflectionError";
  }
}

/** Program plans with no workouts and no duration still get a usable grid. */
const DEFAULT_PLAN_DAYS = 28;
/** Upper bound on the trainer's Scheduled list (one query, grouped client-side). */
const UPCOMING_LIST_LIMIT = 2000;
/** Wrapper programs created by calendar ad-hoc actions — never a real program. */
const AD_HOC_TAG = "ad-hoc";

function contentData(content: ReflectionContentInput) {
  return {
    kind: content.kind,
    text: content.text,
    author: content.author,
    guidance: content.guidance,
    theme: content.theme,
    imageUrl: content.imageUrl,
    source: content.source,
    allowJournal: content.allowJournal,
    allowShare: content.allowShare,
  };
}

// ─── Client-dated reflections (fan-out) ──────────────────────────────────────

/**
 * Writes one Reflection per (client, date) pair. Re-scheduling a pair this
 * trainer already scheduled replaces the earlier row, so a client never has
 * two of the same trainer's reflections competing for one day.
 *
 * Callers authorize `clientIds` (getClientIdsForTrainer) before calling.
 */
export async function scheduleClientReflections(input: {
  trainerId: string;
  clientIds: string[];
  dates: Date[];
  content: ReflectionContentInput;
}): Promise<{ count: number }> {
  const clientIds = [...new Set(input.clientIds)];
  const dates = input.dates.map(toUtcDay);
  if (clientIds.length === 0 || dates.length === 0) throw new ReflectionError("no_targets");

  const rowCount = clientIds.length * dates.length;
  if (rowCount > MAX_FANOUT_ROWS) {
    throw new ReflectionError(
      "too_many_rows",
      `That schedule would create ${rowCount} reflections — the limit is ${MAX_FANOUT_ROWS} per save.`
    );
  }

  const data = contentData(input.content);
  // One transaction, so a failed insert never leaves the replaced days empty.
  const [, result] = await prisma.$transaction([
    prisma.reflection.deleteMany({
      where: { trainerId: input.trainerId, clientId: { in: clientIds }, date: { in: dates } },
    }),
    prisma.reflection.createMany({
      data: clientIds.flatMap((clientId) =>
        dates.map((date) => ({ ...data, trainerId: input.trainerId, clientId, date, programId: null, dayIndex: null }))
      ),
    }),
  ]);
  return { count: result.count };
}

/**
 * Rewrites the content of the trainer's own client-dated rows. Rows for
 * clients no longer on `rosterClientIds` (they left the org) are ignored.
 */
export async function updateReflections(
  trainerId: string,
  ids: string[],
  content: ReflectionContentInput,
  rosterClientIds: string[]
) {
  const result = await prisma.reflection.updateMany({
    where: { id: { in: ids }, trainerId, clientId: { in: rosterClientIds } },
    data: contentData(content),
  });
  return { count: result.count };
}

export async function deleteReflections(trainerId: string, ids: string[], rosterClientIds: string[]) {
  const result = await prisma.reflection.deleteMany({
    where: { id: { in: ids }, trainerId, clientId: { in: rosterClientIds } },
  });
  return { count: result.count };
}

export type ScheduledReflectionRow = Pick<
  Reflection,
  "id" | "kind" | "text" | "author" | "guidance" | "theme" | "imageUrl" | "source" | "allowJournal" | "allowShare"
> & { date: Date; clientId: string; clientName: string };

/** The trainer's client-dated reflections from `from` onwards, soonest first. */
export async function listUpcomingClientReflections(
  trainerId: string,
  from: Date,
  rosterClientIds: string[]
): Promise<ScheduledReflectionRow[]> {
  if (rosterClientIds.length === 0) return [];
  const rows = await prisma.reflection.findMany({
    // Program-day rows have no date, so the date filter alone keeps them out.
    where: { trainerId, clientId: { in: rosterClientIds }, date: { gte: toUtcDay(from) } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: UPCOMING_LIST_LIMIT,
  });
  const names = await clientNames(rows.map((row) => row.clientId!));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    text: row.text,
    author: row.author,
    guidance: row.guidance,
    theme: row.theme,
    imageUrl: row.imageUrl,
    source: row.source,
    allowJournal: row.allowJournal,
    allowShare: row.allowShare,
    date: row.date!,
    clientId: row.clientId!,
    clientName: names.get(row.clientId!) ?? "Client",
  }));
}

/** Upcoming dated reflections for one client (trainer client-detail tab). Callers authorize the client. */
export async function listUpcomingForClient(clientId: string, from: Date, limit = 30) {
  return prisma.reflection.findMany({
    where: { clientId, date: { gte: toUtcDay(from) } },
    orderBy: { date: "asc" },
    take: limit,
    select: { id: true, date: true, kind: true, text: true, author: true, trainerId: true },
  });
}

async function clientNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]));
}

// ─── Program plans ───────────────────────────────────────────────────────────

/** A trainer's own programs that can carry a day-by-day reflection plan. */
export async function listPlanPrograms(trainerId: string) {
  const programs = await prisma.program.findMany({
    where: { trainerId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      clientId: true,
      schedulingType: true,
      tags: true,
      client: { select: { firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const eligible = programs.filter(
    (p) => !p.tags.includes(AD_HOC_TAG) && getProgramSchedulingType(p) === "SCHEDULED"
  );

  const counts = eligible.length
    ? await prisma.reflection.groupBy({
        by: ["programId"],
        where: { programId: { in: eligible.map((p) => p.id) } },
        _count: { _all: true },
      })
    : [];
  const countByProgram = new Map(counts.map((c) => [c.programId, c._count._all]));

  return eligible.map((p) => ({
    id: p.id,
    name: p.name,
    isTemplate: !p.clientId,
    clientName: p.client ? `${p.client.firstName} ${p.client.lastName}`.trim() : null,
    reflectionCount: countByProgram.get(p.id) ?? 0,
  }));
}

/** The program if (and only if) this trainer owns it; null otherwise. */
export async function getOwnedProgram(trainerId: string, programId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: {
      id: true,
      name: true,
      trainerId: true,
      clientId: true,
      durationWeeks: true,
      workouts: { select: { name: true, weekIndex: true, dayIndex: true } },
    },
  });
  if (!program || program.trainerId !== trainerId) return null;
  return program;
}

export interface ProgramPlanDay {
  dayNumber: number;
  workoutName: string | null;
  reflection: Pick<
    Reflection,
    "id" | "kind" | "text" | "author" | "guidance" | "theme" | "imageUrl" | "source" | "allowJournal" | "allowShare"
  > | null;
}

/**
 * Day-by-day plan for a program the trainer owns. The day count covers the
 * program's workout span, its declared duration and any reflection already
 * placed beyond both, capped at MAX_PROGRAM_PLAN_DAYS.
 */
export async function getProgramPlan(trainerId: string, programId: string) {
  const program = await getOwnedProgram(trainerId, programId);
  if (!program) throw new ReflectionError("program_not_found");

  const reflections = await prisma.reflection.findMany({
    where: { programId },
    orderBy: { dayIndex: "asc" },
  });

  const workoutByDay = new Map<number, string>();
  for (const workout of program.workouts) {
    workoutByDay.set(workout.weekIndex * 7 + workout.dayIndex, workout.name);
  }
  const workoutSpan = workoutByDay.size ? Math.max(...workoutByDay.keys()) + 1 : 0;
  const reflectionSpan = reflections.length ? Math.max(...reflections.map((r) => r.dayIndex ?? 0)) + 1 : 0;
  const totalDays = Math.min(
    MAX_PROGRAM_PLAN_DAYS,
    Math.max(workoutSpan, (program.durationWeeks ?? 0) * 7, reflectionSpan) || DEFAULT_PLAN_DAYS
  );

  const reflectionByDay = new Map(reflections.map((r) => [r.dayIndex ?? -1, r]));
  const days: ProgramPlanDay[] = Array.from({ length: totalDays }, (_, dayIndex) => {
    const reflection = reflectionByDay.get(dayIndex);
    return {
      dayNumber: dayIndex + 1,
      workoutName: workoutByDay.get(dayIndex) ?? null,
      reflection: reflection
        ? {
            id: reflection.id,
            kind: reflection.kind,
            text: reflection.text,
            author: reflection.author,
            guidance: reflection.guidance,
            theme: reflection.theme,
            imageUrl: reflection.imageUrl,
            source: reflection.source,
            allowJournal: reflection.allowJournal,
            allowShare: reflection.allowShare,
          }
        : null,
    };
  });

  return {
    program: { id: program.id, name: program.name, isTemplate: !program.clientId, totalDays },
    days,
  };
}

/** Sets (creates or replaces) the reflection for one program day. Callers verify ownership. */
export async function upsertProgramReflection(input: {
  trainerId: string;
  programId: string;
  dayIndex: number;
  content: ReflectionContentInput;
}) {
  const data = contentData(input.content);
  const existing = await prisma.reflection.findFirst({
    where: { programId: input.programId, dayIndex: input.dayIndex },
    select: { id: true },
  });
  if (existing) {
    return prisma.reflection.update({ where: { id: existing.id }, data: { ...data, trainerId: input.trainerId } });
  }
  return prisma.reflection.create({
    data: {
      ...data,
      trainerId: input.trainerId,
      programId: input.programId,
      dayIndex: input.dayIndex,
      clientId: null,
      date: null,
    },
  });
}

export async function deleteProgramReflection(programId: string, dayIndex: number) {
  const result = await prisma.reflection.deleteMany({ where: { programId, dayIndex } });
  return { count: result.count };
}

/** Writes many program days at once (AI fill). Only days still empty are written. */
export async function fillProgramDays(input: {
  trainerId: string;
  programId: string;
  days: Array<{ dayIndex: number; content: ReflectionContentInput }>;
}): Promise<{ count: number }> {
  if (input.days.length === 0) return { count: 0 };
  const taken = await prisma.reflection.findMany({
    where: { programId: input.programId, dayIndex: { in: input.days.map((d) => d.dayIndex) } },
    select: { dayIndex: true },
  });
  const takenDays = new Set(taken.map((t) => t.dayIndex));
  const fresh = input.days.filter((d) => !takenDays.has(d.dayIndex));
  if (fresh.length === 0) return { count: 0 };

  const result = await prisma.reflection.createMany({
    data: fresh.map((d) => ({
      ...contentData(d.content),
      trainerId: input.trainerId,
      programId: input.programId,
      dayIndex: d.dayIndex,
      clientId: null,
      date: null,
    })),
  });
  return { count: result.count };
}

// ─── Today's reflection (client) ─────────────────────────────────────────────

export interface TodaysReflection {
  /** Reflection row id; null for a built-in library fallback. */
  reflectionId: string | null;
  /** Library entry id for the fallback; null for a Reflection row. */
  libraryId: string | null;
  origin: "SCHEDULED" | "PROGRAM" | "LIBRARY";
  kind: ReflectionKind;
  text: string;
  author: string | null;
  guidance: string | null;
  theme: string | null;
  imageUrl: string | null;
  allowJournal: boolean;
  allowShare: boolean;
  /** UTC midnight of the day this reflection is for. */
  date: Date;
}

function fromRow(row: Reflection, origin: TodaysReflection["origin"], date: Date): TodaysReflection {
  return {
    reflectionId: row.id,
    libraryId: null,
    origin,
    kind: row.kind as ReflectionKind,
    text: row.text,
    author: row.author,
    guidance: row.guidance,
    theme: row.theme,
    imageUrl: row.imageUrl,
    allowJournal: row.allowJournal,
    allowShare: row.allowShare,
    date,
  };
}

function fromLibrary(clientId: string, day: Date): TodaysReflection {
  const entry = getLibraryReflectionForDate(day, clientId);
  return {
    reflectionId: null,
    libraryId: entry.id,
    origin: "LIBRARY",
    kind: entry.kind,
    text: entry.text,
    author: entry.author ?? null,
    guidance: null,
    theme: entry.theme,
    imageUrl: null,
    allowJournal: true,
    allowShare: true,
    date: day,
  };
}

/**
 * Every reflection that may show for this client on `day` (a UTC-anchored
 * calendar day — the client's local date), best first:
 *  1. Reflections scheduled for this client on this date by a trainer who is
 *     still in the client's org (latest write first) — a former trainer's
 *     rows never reach a former client;
 *  2. program-day reflections from the client's own ACTIVE, SCHEDULED
 *     programs that have started — looked up on the client's copy and on its
 *     source template (assign always duplicates), the copy's own row first;
 *  3. the built-in library entry for the day, so the list is never empty.
 */
export async function listReflectionCandidatesForDay(clientId: string, day: Date): Promise<TodaysReflection[]> {
  const date = toUtcDay(day);
  const trainerIds = (await getTrainersForClient(clientId)).map((trainer) => trainer.id);

  const scheduled = trainerIds.length
    ? await prisma.reflection.findMany({
        where: { clientId, date, trainerId: { in: trainerIds } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const program = await findProgramReflections(clientId, date);

  return [
    ...scheduled.map((row) => fromRow(row, "SCHEDULED", date)),
    ...program.map((row) => fromRow(row, "PROGRAM", date)),
    fromLibrary(clientId, date),
  ];
}

/** The reflection the client sees on `day` — the first candidate. */
export async function getTodaysReflection(clientId: string, day: Date): Promise<TodaysReflection> {
  const [first] = await listReflectionCandidatesForDay(clientId, day);
  return first;
}

/**
 * The candidate the client actually answered, identified by the reference the
 * card rendered (a Reflection id, or a library id for the fallback). null when
 * that reference is not one of this client's reflections for that day — the
 * caller then refuses the save rather than trusting the browser.
 */
export async function findReflectionForDay(
  clientId: string,
  day: Date,
  ref: { reflectionId: string | null; libraryId: string | null }
): Promise<TodaysReflection | null> {
  const candidates = await listReflectionCandidatesForDay(clientId, day);
  return (
    candidates.find((candidate) =>
      ref.reflectionId ? candidate.reflectionId === ref.reflectionId : candidate.libraryId === ref.libraryId
    ) ?? null
  );
}

async function findProgramReflections(clientId: string, day: Date): Promise<Reflection[]> {
  const programs = await prisma.program.findMany({
    where: { clientId, status: "ACTIVE", startDate: { lte: day } },
    select: { id: true, sourceTemplateId: true, startDate: true, schedulingType: true, tags: true },
    orderBy: { startDate: "desc" },
  });

  // Most recently started program first; within one program, its own row
  // before the template's.
  const candidates = programs
    .filter((p) => p.startDate && !p.tags.includes(AD_HOC_TAG) && getProgramSchedulingType(p) === "SCHEDULED")
    .map((p) => ({
      dayIndex: utcDaysBetween(p.startDate!, day),
      programIds: [p.id, ...(p.sourceTemplateId ? [p.sourceTemplateId] : [])],
    }))
    .filter((c) => c.dayIndex >= 0 && c.dayIndex < MAX_PROGRAM_PLAN_DAYS);
  if (candidates.length === 0) return [];

  const rows = await prisma.reflection.findMany({
    where: { OR: candidates.map((c) => ({ programId: { in: c.programIds }, dayIndex: c.dayIndex })) },
  });
  const ordered: Reflection[] = [];
  for (const candidate of candidates) {
    for (const programId of candidate.programIds) {
      const match = rows.find((r) => r.programId === programId && r.dayIndex === candidate.dayIndex);
      if (match && !ordered.includes(match)) ordered.push(match);
    }
  }
  return ordered;
}
