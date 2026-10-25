import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { PlanStatus, Prisma } from "@prisma/client";

// Canonical implementation lives in lib/utils so client components can use it
// without pulling Prisma into the browser bundle. Re-exported here so server
// callers can keep reaching it through the program service.
export {
  getProgramSchedulingType,
  getProgramSchedulingLabel,
  type ProgramSchedulingTypeValue,
} from "@/lib/utils/program-scheduling";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { isFollowAlongProgram, FOLLOW_ALONG_CONTENT_FORMAT } from "@/lib/utils/follow-along";

export function computeDurationWeeksFromWorkouts(
  workouts: { weekIndex: number }[]
): number | null {
  if (!workouts.length) return null;
  return Math.max(...workouts.map((w) => w.weekIndex)) + 1;
}

// A valid 12-byte ObjectId as a 24-char hex string, generated client-side so we
// can bulk-insert child rows referencing their parents without a round-trip to
// read back generated ids.
function newObjectId(): string {
  return randomBytes(12).toString("hex");
}
import type {
  CreateProgramInput,
  ProgramFilterInput,
} from "@/lib/validators/program";

// --- Include presets ---
const programListInclude = {
  trainer: { select: { id: true, firstName: true, lastName: true } },
  client: { select: { id: true, firstName: true, lastName: true, email: true } },
  workouts: { select: { id: true, name: true } },
  _count: { select: { workouts: true } },
} satisfies Prisma.ProgramInclude;

const programDetailInclude = {
  trainer: { select: { id: true, firstName: true, lastName: true } },
  client: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      clientProfile: true,
    },
  },
  workouts: {
    orderBy: { orderIndex: "asc" as const },
    include: {
      blocks: {
        orderBy: { orderIndex: "asc" as const },
        include: {
          exercises: {
            orderBy: { orderIndex: "asc" as const },
            include: {
              exercise: { include: { media: true } },
              sets: { orderBy: { orderIndex: "asc" as const } },
            },
          },
        },
      },
      _count: { select: { sessions: true } },
    },
  },
} satisfies Prisma.ProgramInclude;

// --- CRUD ---

// Bulk-insert the workout tree one LEVEL at a time via createMany, rather
// than a single deeply-nested `create`/`update` (workouts → blocks →
// exercises → sets), which inserts every descendant in its own round-trip —
// hundreds of them for a real program, ~250ms each on a remote DB, minutes
// total, and the wrapping transaction can abort/time out on Mongo before it
// finishes. Pre-generating ObjectIds lets each child row reference its
// parent, so the whole tree is 4 bulk inserts regardless of size. Shared by
// createProgram and updateProgram — both build the same tree, just against a
// new vs. existing programId.
type WorkoutInput = CreateProgramInput["workouts"][number];
type BlockInput = WorkoutInput["blocks"][number];
type ExerciseInput = BlockInput["exercises"][number];
type SetInput = ExerciseInput["sets"][number];

// The stored columns of each tree level, minus id and parent key. Shared by the
// bulk insert and the in-place sync so both write exactly the same fields.
function workoutFields(w: WorkoutInput) {
  return {
    name: w.name,
    description: w.description ?? null,
    dayIndex: w.dayIndex,
    weekIndex: w.weekIndex,
    orderIndex: w.orderIndex,
    estimatedMinutes: w.estimatedMinutes ?? null,
    videoUrl: w.videoUrl ?? null,
    videoDurationSec: w.videoDurationSec ?? null,
  };
}

function blockFields(b: BlockInput) {
  return {
    name: b.name ?? null,
    type: b.type,
    orderIndex: b.orderIndex,
    rounds: b.rounds,
    restBetweenRounds: b.restBetweenRounds ?? null,
    timeCap: b.timeCap ?? null,
    notes: b.notes ?? null,
  };
}

function exerciseFields(e: ExerciseInput) {
  return {
    exerciseId: e.exerciseId,
    orderIndex: e.orderIndex,
    activityType: e.activityType,
    restSeconds: e.restSeconds ?? null,
    notes: e.notes ?? null,
    supersetGroup: e.supersetGroup ?? null,
  };
}

function setFields(s: SetInput) {
  return {
    orderIndex: s.orderIndex,
    setType: s.setType,
    targetReps: s.targetReps ?? null,
    targetWeight: s.targetWeight ?? null,
    targetDuration: s.targetDuration ?? null,
    targetDurationUnit: s.targetDurationUnit ?? null,
    targetDistance: s.targetDistance ?? null,
    targetPace: s.targetPace ?? null,
    targetHrZone: s.targetHrZone ?? null,
    repeatCount: s.repeatCount ?? null,
    targetRPE: s.targetRPE ?? null,
    restAfter: s.restAfter ?? null,
  };
}

async function insertWorkoutTree(programId: string, workouts: CreateProgramInput["workouts"]) {
  const workoutRows: Prisma.WorkoutCreateManyInput[] = [];
  const blockRows: Prisma.WorkoutBlockV2CreateManyInput[] = [];
  const exerciseRows: Prisma.BlockExerciseV2CreateManyInput[] = [];
  const setRows: Prisma.ExerciseSetCreateManyInput[] = [];

  for (const w of workouts) {
    const workoutId = newObjectId();
    workoutRows.push({ id: workoutId, programId, ...workoutFields(w) });
    for (const b of w.blocks) {
      const blockId = newObjectId();
      blockRows.push({ id: blockId, workoutId, ...blockFields(b) });
      for (const e of b.exercises) {
        const blockExerciseId = newObjectId();
        exerciseRows.push({ id: blockExerciseId, blockId, ...exerciseFields(e) });
        for (const set of e.sets) {
          setRows.push({ id: newObjectId(), blockExerciseId, ...setFields(set) });
        }
      }
    }
  }

  if (workoutRows.length) await prisma.workout.createMany({ data: workoutRows });
  if (blockRows.length) await prisma.workoutBlockV2.createMany({ data: blockRows });
  if (exerciseRows.length) await prisma.blockExerciseV2.createMany({ data: exerciseRows });
  if (setRows.length) await prisma.exerciseSet.createMany({ data: setRows });
}

/**
 * Saves a program's workout tree IN PLACE rather than deleting and rebuilding
 * it. A rebuild cascades away every WorkoutSessionV2 (Workout → sessions), so
 * one editor save used to wipe a client's whole history on the program; and
 * SessionExerciseLog.blockExerciseId is a bare id, so recreated exercises
 * would orphan every logged set even if the sessions survived.
 *
 * Each row that comes back with an id this program already owns is kept —
 * updated only if a field changed, re-parented if it was moved to another
 * day/block. Rows without one (or with a foreign or repeated id, e.g. a
 * duplicated day) are created, and only rows that disappeared are deleted.
 * Ids are matched across the whole program at every level, so moving an
 * exercise between days keeps its id and its logs. Still bulk-inserts new
 * rows a level at a time, for the reason given on insertWorkoutTree.
 */
async function syncWorkoutTree(programId: string, workouts: CreateProgramInput["workouts"]) {
  const existing = await prisma.workout.findMany({
    where: { programId },
    select: {
      id: true,
      name: true,
      description: true,
      dayIndex: true,
      weekIndex: true,
      orderIndex: true,
      estimatedMinutes: true,
      videoUrl: true,
      videoDurationSec: true,
      blocks: {
        select: {
          id: true,
          workoutId: true,
          name: true,
          type: true,
          orderIndex: true,
          rounds: true,
          restBetweenRounds: true,
          timeCap: true,
          notes: true,
          exercises: {
            select: {
              id: true,
              blockId: true,
              exerciseId: true,
              orderIndex: true,
              activityType: true,
              restSeconds: true,
              notes: true,
              supersetGroup: true,
              sets: {
                select: {
                  id: true,
                  blockExerciseId: true,
                  orderIndex: true,
                  setType: true,
                  targetReps: true,
                  targetWeight: true,
                  targetDuration: true,
                  targetDurationUnit: true,
                  targetDistance: true,
                  targetPace: true,
                  targetHrZone: true,
                  repeatCount: true,
                  targetRPE: true,
                  restAfter: true,
                },
              },
            },
          },
        },
      },
    },
  });

  type Row = { id: string } & Record<string, unknown>;
  const level = () => ({
    existing: new Map<string, Row>(),
    claimed: new Set<string>(),
    updates: [] as { id: string; data: Record<string, unknown> }[],
  });
  const workoutsLvl = level();
  const blocksLvl = level();
  const exercisesLvl = level();
  const setsLvl = level();
  for (const w of existing) {
    workoutsLvl.existing.set(w.id, w);
    for (const b of w.blocks ?? []) {
      blocksLvl.existing.set(b.id, b);
      for (const e of b.exercises) {
        exercisesLvl.existing.set(e.id, e);
        for (const set of e.sets) setsLvl.existing.set(set.id, set);
      }
    }
  }

  // Returns the id to write under: the existing row's (queuing an update if
  // anything differs), or null when the row has to be created.
  function match(lvl: ReturnType<typeof level>, id: string | undefined, next: Record<string, unknown>) {
    const current = id ? lvl.existing.get(id) : undefined;
    if (!current || lvl.claimed.has(current.id)) return null;
    lvl.claimed.add(current.id);
    const changed = Object.keys(next).filter((k) => (current[k] ?? null) !== (next[k] ?? null));
    if (changed.length) lvl.updates.push({ id: current.id, data: Object.fromEntries(changed.map((k) => [k, next[k]])) });
    return current.id;
  }

  const workoutRows: Prisma.WorkoutCreateManyInput[] = [];
  const blockRows: Prisma.WorkoutBlockV2CreateManyInput[] = [];
  const exerciseRows: Prisma.BlockExerciseV2CreateManyInput[] = [];
  const setRows: Prisma.ExerciseSetCreateManyInput[] = [];

  for (const w of workouts) {
    const wData = workoutFields(w);
    let workoutId = match(workoutsLvl, w.id, wData);
    if (!workoutId) {
      workoutId = newObjectId();
      workoutRows.push({ id: workoutId, programId, ...wData });
    }
    for (const b of w.blocks) {
      const bData = { workoutId, ...blockFields(b) };
      let blockId = match(blocksLvl, b.id, bData);
      if (!blockId) {
        blockId = newObjectId();
        blockRows.push({ id: blockId, ...bData });
      }
      for (const e of b.exercises) {
        const eData = { blockId, ...exerciseFields(e) };
        let blockExerciseId = match(exercisesLvl, e.id, eData);
        if (!blockExerciseId) {
          blockExerciseId = newObjectId();
          exerciseRows.push({ id: blockExerciseId, ...eData });
        }
        for (const set of e.sets) {
          const sData = { blockExerciseId, ...setFields(set) };
          if (!match(setsLvl, set.id, sData)) setRows.push({ id: newObjectId(), ...sData });
        }
      }
    }
  }

  // Parents before children, then updates (which may re-parent rows onto the
  // new ones), and deletes last so a cascade never takes a row that was moved.
  if (workoutRows.length) await prisma.workout.createMany({ data: workoutRows });
  if (blockRows.length) await prisma.workoutBlockV2.createMany({ data: blockRows });
  if (exerciseRows.length) await prisma.blockExerciseV2.createMany({ data: exerciseRows });
  if (setRows.length) await prisma.exerciseSet.createMany({ data: setRows });

  await Promise.all([
    ...workoutsLvl.updates.map((u) => prisma.workout.update({ where: { id: u.id }, data: u.data })),
    ...blocksLvl.updates.map((u) => prisma.workoutBlockV2.update({ where: { id: u.id }, data: u.data })),
    ...exercisesLvl.updates.map((u) => prisma.blockExerciseV2.update({ where: { id: u.id }, data: u.data })),
    ...setsLvl.updates.map((u) => prisma.exerciseSet.update({ where: { id: u.id }, data: u.data })),
  ]);

  const removed = (lvl: ReturnType<typeof level>) =>
    [...lvl.existing.keys()].filter((id) => !lvl.claimed.has(id));
  const removedWorkouts = removed(workoutsLvl);
  const removedBlocks = removed(blocksLvl);
  const removedExercises = removed(exercisesLvl);
  const removedSets = removed(setsLvl);
  if (removedWorkouts.length) {
    await prisma.workout.deleteMany({ where: { programId, id: { in: removedWorkouts } } });
  }
  if (removedBlocks.length) await prisma.workoutBlockV2.deleteMany({ where: { id: { in: removedBlocks } } });
  if (removedExercises.length) await prisma.blockExerciseV2.deleteMany({ where: { id: { in: removedExercises } } });
  if (removedSets.length) await prisma.exerciseSet.deleteMany({ where: { id: { in: removedSets } } });
}

export async function createProgram(
  trainerId: string,
  data: CreateProgramInput
) {
  const { workouts, startDate, organizationIds, ...rest } = data;
  void organizationIds;

  const program = await prisma.program.create({
    data: {
      ...rest,
      trainerId,
      // Must be written explicitly (not omitted) — Prisma's MongoDB filters
      // for `clientId: null` only match documents where the field is
      // present and null, not documents where it's absent. Omitting it here
      // makes the program invisible to both the "Assigned" and "Library"
      // tab queries in getPrograms.
      clientId: null,
      startDate: startDate ? new Date(startDate) : undefined,
    },
  });

  await insertWorkoutTree(program.id, workouts);

  const full = await prisma.program.findUnique({
    where: { id: program.id },
    include: programDetailInclude,
  });
  if (!full) throw new Error("Program not found immediately after creation");
  return full;
}

export async function getProgramById(id: string) {
  return prisma.program.findUnique({
    where: { id },
    include: programDetailInclude,
  });
}

const RECENT_WINDOW_DAYS = 30;

export async function getPrograms(
  trainerId: string,
  filters: ProgramFilterInput = {}
) {
  const where: Prisma.ProgramWhereInput = {
    trainerId,
    isGlobal: { not: true },
    ...(filters.status && { status: filters.status as PlanStatus }),
    ...(filters.isTemplate !== undefined && { isTemplate: filters.isTemplate }),
    ...(filters.clientId && { clientId: filters.clientId }),
    ...(filters.hasClient !== undefined && {
      clientId: filters.hasClient ? { not: null } : null,
    }),
    ...(filters.isFavorite !== undefined && { isFavorite: filters.isFavorite }),
    ...(filters.collectionId && { collectionIds: { has: filters.collectionId } }),
    ...(filters.recentOnly && {
      updatedAt: { gte: new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
    }),
    ...(filters.tags?.length && {
      OR: [
        { tags: { hasSome: filters.tags } },
        { bodyAreas: { hasSome: filters.tags } },
        { goals: { hasSome: filters.tags } },
        { activities: { hasSome: filters.tags } },
      ],
    }),
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" as const } },
        {
          workouts: {
            some: { name: { contains: filters.search, mode: "insensitive" as const } },
          },
        },
      ],
    }),
  };

  const programs = await prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });

  // Filter out single-workout wrapper programs created by calendar actions
  // (createAdHocWorkout, duplicateWorkoutToDateAction) — these exist only to
  // satisfy Workout.programId and should never surface as a real program.
  // Done in-memory rather than via a `tags` where-clause because many older
  // Program documents predate the `tags` field and have no value stored for
  // it at all, which Mongo's array `NOT`/`has` filters incorrectly exclude.
  return programs.filter((p) => !p.tags.includes("ad-hoc"));
}

export async function toggleProgramFavorite(id: string, isFavorite: boolean) {
  return prisma.program.update({ where: { id }, data: { isFavorite } });
}

export interface ProgramNextSession {
  /** The WorkoutSessionV2 id — the client's "Continue Workout" CTA links to /sessions/{id}. */
  sessionId: string;
  workoutName: string;
  scheduledDate: Date;
  estimatedMinutes: number | null;
  exerciseCount: number;
  /** Set for follow-along video days — the card shows "Follow-along · N min" instead of an exercise count. */
  videoUrl?: string | null;
  videoDurationSec?: number | null;
}

export interface ProgramProgress {
  completed: number;
  total: number;
  nextSession: ProgramNextSession | null;
}

/**
 * Per-program session-completion snapshot for the trainer's Assigned tab
 * (Progress / Next Workout columns) and the client's program cards. One query
 * across every requested program rather than N+1 per row — `orderBy:
 * scheduledDate asc` lets a single pass pick each program's soonest upcoming
 * session as it's encountered.
 */
export async function getProgramProgressMap(
  programIds: string[]
): Promise<Record<string, ProgramProgress>> {
  const map: Record<string, ProgramProgress> = {};
  for (const id of programIds) map[id] = { completed: 0, total: 0, nextSession: null };
  if (programIds.length === 0) return map;

  const sessions = await prisma.workoutSessionV2.findMany({
    where: { workout: { programId: { in: programIds } } },
    select: {
      id: true,
      status: true,
      scheduledDate: true,
      workout: {
        select: {
          programId: true,
          name: true,
          estimatedMinutes: true,
          videoUrl: true,
          videoDurationSec: true,
          blocks: { select: { exercises: { select: { id: true } } } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  // scheduledDate is UTC-midnight-anchored (see lib/utils/calendar-date.ts), so
  // comparing against the current instant would drop a session that is due
  // *today* the moment the day starts. Anchor to the start of today instead, so
  // today's still-pending workout is the one offered as "next".
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const session of sessions) {
    const entry = map[session.workout.programId];
    if (!entry) continue;
    entry.total += 1;
    if (session.status === "COMPLETED") entry.completed += 1;
    if (
      !entry.nextSession &&
      (session.status === "SCHEDULED" || session.status === "IN_PROGRESS") &&
      session.scheduledDate >= todayStart
    ) {
      entry.nextSession = {
        sessionId: session.id,
        workoutName: session.workout.name,
        scheduledDate: session.scheduledDate,
        estimatedMinutes: session.workout.estimatedMinutes,
        exerciseCount: session.workout.blocks.reduce((n, b) => n + b.exercises.length, 0),
        videoUrl: session.workout.videoUrl ?? null,
        videoDurationSec: session.workout.videoDurationSec ?? null,
      };
    }
  }

  return map;
}

export async function setProgramCollections(id: string, collectionIds: string[]) {
  return prisma.program.update({ where: { id }, data: { collectionIds } });
}

export async function updateProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  const { workouts, startDate, ...rest } = data;

  await prisma.program.update({
    where: { id },
    data: {
      ...rest,
      status: rest.status as PlanStatus | undefined,
      // null clears it (a program switched to a Resource); undefined leaves it.
      startDate: startDate ? new Date(startDate) : startDate === null ? null : undefined,
    },
  });

  // In place, so a client's sessions and logged sets survive the save.
  if (workouts) await syncWorkoutTree(id, workouts);

  const full = await prisma.program.findUnique({ where: { id }, include: programDetailInclude });
  if (!full) throw new Error("Program not found immediately after update");
  return full;
}

/**
 * Follow-along save. updateProgram now edits every program's workouts in place
 * (see syncWorkoutTree), so a follow-along needs nothing extra — kept as its
 * own entry point for the follow-along actions.
 */
export async function updateFollowAlongProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  return updateProgram(id, data);
}

export async function deleteProgram(id: string) {
  return prisma.program.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

async function assertNotLinkedToSellablePackage(id: string) {
  const linkedPackage = await prisma.coachPackage.findFirst({
    where: { programTemplateId: id },
    select: { id: true },
  });
  if (linkedPackage) {
    throw new Error("Cannot delete: this program is linked to a sellable package");
  }
}

// Permanently removes an archived program. Workouts, blocks, exercises, sets,
// sessions, and voice memos cascade via the schema's onDelete: Cascade chain.
export async function hardDeleteProgram(id: string) {
  const program = await prisma.program.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!program) throw new Error("Program not found");
  if (program.status !== "ARCHIVED") {
    throw new Error("Cannot delete: only archived programs can be permanently deleted");
  }

  await assertNotLinkedToSellablePackage(id);

  return prisma.program.delete({ where: { id } });
}

// Removes a program that's assigned to a client, in one step (no archive-first
// requirement). Workouts, blocks, exercises, sets, sessions, and voice memos
// cascade via the schema's onDelete: Cascade chain, so this also clears the
// program's workouts off the client's calendar.
export async function deleteClientProgram(id: string) {
  const program = await prisma.program.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!program) throw new Error("Program not found");
  if (!program.clientId) {
    throw new Error("Cannot delete: this program is not assigned to a client");
  }

  await assertNotLinkedToSellablePackage(id);

  return prisma.program.delete({ where: { id } });
}

type ProgramWithDetails = NonNullable<Awaited<ReturnType<typeof getProgramById>>>;

// Shared by duplicateProgram (template -> new copy) and syncProgramToTemplate
// (assigned copy -> its master template): re-indexes and strips DB-only
// fields (ids, timestamps) so the tree can be handed to createProgram/
// updateProgram's nested-create input.
function mapWorkoutsForCopy(workouts: ProgramWithDetails["workouts"]) {
  return workouts.map((w, wi) => ({
    name: w.name,
    description: w.description,
    dayIndex: w.dayIndex,
    weekIndex: w.weekIndex,
    orderIndex: wi,
    estimatedMinutes: w.estimatedMinutes,
    // Follow-along days are zero-block video workouts — dropping these would
    // turn every copied/assigned video day into an empty workout.
    videoUrl: w.videoUrl,
    videoDurationSec: w.videoDurationSec,
    blocks: w.blocks.map((b, bi) => ({
      name: b.name,
      type: b.type as "NORMAL" | "WARMUP" | "COOLDOWN" | "SUPERSET" | "CIRCUIT" | "AMRAP" | "EMOM",
      orderIndex: bi,
      rounds: b.rounds,
      restBetweenRounds: b.restBetweenRounds,
      timeCap: b.timeCap,
      notes: b.notes,
      exercises: b.exercises.map((e, ei) => ({
        exerciseId: e.exerciseId,
        orderIndex: ei,
        activityType: e.activityType as "STRENGTH" | "RUN" | "INTERVAL_RUN",
        restSeconds: e.restSeconds,
        notes: e.notes,
        supersetGroup: e.supersetGroup,
        sets: e.sets.map((s, si) => ({
          orderIndex: si,
          setType: s.setType as
            | "NORMAL"
            | "WARMUP"
            | "DROP_SET"
            | "FAILURE",
          targetReps: s.targetReps,
          targetWeight: s.targetWeight,
          targetDuration: s.targetDuration,
          targetDistance: s.targetDistance,
          targetRPE: s.targetRPE,
          restAfter: s.restAfter,
        })),
      })),
    })),
  }));
}

export async function duplicateProgram(
  id: string,
  trainerId: string,
  asTemplate = false
) {
  const source = await getProgramById(id);
  if (!source) throw new Error("Program not found");

  if (source.trainerId !== trainerId && !source.isPublic && !source.isGlobal) {
    throw new Error("Unauthorized");
  }

  return createProgram(trainerId, {
    name: `${source.name} (Copy)`,
    description: source.description,
    isTemplate: asTemplate,
    sourceTemplateId: source.id,
    // A Resource stays a Resource when copied — otherwise assigning an
    // On-Demand template (which assigns a clone) would silently produce a
    // Scheduled program.
    schedulingType: getProgramSchedulingType(source),
    // A follow-along template must stay follow-along when assigned (assign
    // clones the template), or the client gets exercise-less workouts.
    contentFormat: isFollowAlongProgram(source) ? FOLLOW_ALONG_CONTENT_FORMAT : null,
    durationWeeks: source.durationWeeks,
    daysPerWeek: source.daysPerWeek,
    tags: source.tags,
    equipmentRequired: source.equipmentRequired ?? [],
    organizationIds: [],
    workouts: mapWorkoutsForCopy(source.workouts),
    // Categorization travels with the copy; collection membership doesn't —
    // a duplicate is a fresh program, not automatically slotted into the
    // same playlists as its source.
    collectionIds: [],
    bodyAreas: source.bodyAreas ?? [],
    goals: source.goals ?? [],
    activities: source.activities ?? [],
    level: source.level as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null | undefined,
  });
}

// Pushes an assigned program's current workout content (weeks, days,
// sections, exercises, sets) back onto the master template it was cloned
// from. Leaves the template's own name/description/programType/tags alone —
// those are template identity, not workout content, and shouldn't be
// silently overwritten by a client-specific copy.
export async function syncProgramToTemplate(id: string, trainerId: string) {
  const source = await getProgramById(id);
  if (!source) throw new Error("Program not found");
  if (source.trainerId !== trainerId) throw new Error("Unauthorized");
  if (!source.sourceTemplateId) {
    throw new Error("This program isn't linked to a master template");
  }

  const template = await prisma.program.findUnique({
    where: { id: source.sourceTemplateId },
  });
  if (!template) throw new Error("The master template no longer exists");
  if (template.trainerId !== trainerId) throw new Error("Unauthorized");

  return updateProgram(template.id, {
    workouts: mapWorkoutsForCopy(source.workouts),
    durationWeeks: source.durationWeeks,
    daysPerWeek: source.daysPerWeek,
    contentFormat: isFollowAlongProgram(source) ? FOLLOW_ALONG_CONTENT_FORMAT : null,
  });
}

export async function assignProgram(
  programId: string,
  clientId: string,
  startDate: Date
) {
  // Narrow select: only pull the workout fields needed to compute session dates
  const program = await prisma.program.update({
    where: { id: programId },
    data: { clientId, startDate, status: "ACTIVE" },
    select: {
      id: true,
      workouts: { select: { id: true, dayIndex: true, weekIndex: true } },
    },
  });

  if (program.workouts.length > 0) {
    await prisma.workoutSessionV2.createMany({
      data: program.workouts.map((w) => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + w.weekIndex * 7 + w.dayIndex);
        return { workoutId: w.id, clientId, scheduledDate: d, status: "SCHEDULED" as const };
      }),
    });
  }

  return program;
}

/**
 * Brings a client program's sessions in line with its current schedule after
 * an edit. Saving in the editor rebuilds every workout (and the Workout →
 * WorkoutSessionV2 cascade takes their sessions with it), and the trainer may
 * also have changed the start date or switched between Scheduled and Resource.
 *
 * - Resource: drops sessions the client never started — a Resource must never
 *   own a SCHEDULED row (see assignOnDemandProgram).
 * - Scheduled: every workout dated today or later gets a session, and
 *   untouched upcoming sessions move to follow a new start date. Past dates are
 *   left alone so an edit can't flood the client's history with "missed" days.
 */
export async function syncClientProgramSessions(programId: string, now: Date = new Date()) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: {
      clientId: true,
      startDate: true,
      schedulingType: true,
      workouts: {
        select: {
          id: true,
          dayIndex: true,
          weekIndex: true,
          sessions: { select: { id: true, status: true, scheduledDate: true, rescheduledAt: true } },
        },
      },
    },
  });
  if (!program?.clientId) return;
  const clientId = program.clientId;

  if (getProgramSchedulingType(program) === "ON_DEMAND") {
    await prisma.workoutSessionV2.deleteMany({
      where: { workout: { programId }, status: "SCHEDULED" },
    });
    return;
  }
  if (!program.startDate) return;

  const start = program.startDate;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const toCreate: { workoutId: string; clientId: string; scheduledDate: Date; status: "SCHEDULED" }[] = [];
  const toMove: { id: string; scheduledDate: Date }[] = [];

  for (const w of program.workouts) {
    const date = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + w.weekIndex * 7 + w.dayIndex)
    );
    if (date.getTime() < today) continue;
    if (w.sessions.length === 0) {
      toCreate.push({ workoutId: w.id, clientId, scheduledDate: date, status: "SCHEDULED" });
    } else {
      for (const session of w.sessions) {
        if (session.status === "SCHEDULED" && !session.rescheduledAt && session.scheduledDate.getTime() !== date.getTime()) {
          toMove.push({ id: session.id, scheduledDate: date });
        }
      }
    }
  }

  if (toCreate.length > 0) await prisma.workoutSessionV2.createMany({ data: toCreate });
  await Promise.all(
    toMove.map(({ id, scheduledDate }) =>
      prisma.workoutSessionV2.update({ where: { id }, data: { scheduledDate } })
    )
  );
}

/**
 * Attaches an On-Demand ("Resource") program to a client.
 *
 * Mirrors assignProgram's attach step but deliberately writes no startDate and
 * pre-generates no WorkoutSessionV2 rows. The mark-missed-sessions cron flips
 * any SCHEDULED session older than 24h to MISSED with no program-type
 * awareness, so a Resource must never own a SCHEDULED row — its session is
 * created lazily, as IN_PROGRESS, the moment the client actually starts it.
 */
export async function assignOnDemandProgram(programId: string, clientId: string) {
  return prisma.program.update({
    where: { id: programId },
    data: { clientId, status: "ACTIVE" },
    select: { id: true },
  });
}

/**
 * How many times each of the given (program, client) pairs has been used.
 *
 * Powers the Assigned tab's "Used N times / Last used …" column for Resources,
 * which have no schedule and therefore no meaningful progress bar. One query
 * for every requested program rather than N+1 per row.
 */
export interface ProgramUsage {
  count: number;
  lastUsedAt: Date | null;
}

export async function getProgramUsageMap(
  programIds: string[]
): Promise<Record<string, ProgramUsage>> {
  const map: Record<string, ProgramUsage> = {};
  for (const id of programIds) map[id] = { count: 0, lastUsedAt: null };
  if (programIds.length === 0) return map;

  const sessions = await prisma.workoutSessionV2.findMany({
    where: {
      workout: { programId: { in: programIds } },
      status: { in: ["IN_PROGRESS", "COMPLETED"] },
    },
    select: {
      startedAt: true,
      completedAt: true,
      scheduledDate: true,
      workout: { select: { programId: true } },
    },
  });

  for (const session of sessions) {
    const entry = map[session.workout.programId];
    if (!entry) continue;
    entry.count += 1;
    const usedAt = session.completedAt ?? session.startedAt ?? session.scheduledDate;
    if (!entry.lastUsedAt || usedAt > entry.lastUsedAt) entry.lastUsedAt = usedAt;
  }

  return map;
}

export async function getProgramsForClient(clientId: string) {
  const programs = await prisma.program.findMany({
    where: { clientId, status: { in: ["ACTIVE", "PAUSED"] } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });

  // Filter out single-workout wrapper programs created by calendar actions
  // (createAdHocWorkout, duplicateWorkoutToDateAction) — these exist only to
  // satisfy Workout.programId and should never surface as a real "Assigned
  // Program". Done in-memory rather than via a `tags` where-clause because
  // many older Program documents predate the `tags` field and have no value
  // stored for it at all, which Mongo's array `NOT`/`has` filters incorrectly
  // exclude.
  return programs.filter((p) => !p.tags.includes("ad-hoc"));
}

export async function getTemplates(trainerId: string) {
  return prisma.program.findMany({
    // A template is any program with no client — there is no separate flag to set.
    where: { trainerId, ...nullOrUnset("clientId"), status: { not: "ARCHIVED" } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

// --- Global Programs (super admin) ---

export async function getGlobalPrograms(clerkOrgId?: string, excludeTrainerId?: string) {
  const adminCuratedBranch: Prisma.ProgramWhereInput = { isGlobal: true };
  if (clerkOrgId) {
    adminCuratedBranch.OR = [
      { organizationIds: { isEmpty: true } },
      { organizationIds: { has: clerkOrgId } },
    ];
  }

  const publicTrainerBranch: Prisma.ProgramWhereInput = excludeTrainerId
    ? { isPublic: true, trainerId: { not: excludeTrainerId } }
    : { isPublic: true };

  return prisma.program.findMany({
    where: {
      status: { not: "ARCHIVED" },
      OR: [adminCuratedBranch, publicTrainerBranch],
    },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function toggleProgramPublic(id: string, isPublic: boolean) {
  return prisma.program.update({
    where: { id, ...nullOrUnset("clientId") },
    data: { isPublic },
  });
}

export async function createGlobalProgram(data: CreateProgramInput) {
  const { workouts, startDate, ...rest } = data;

  return prisma.program.create({
    data: {
      ...rest,
      isGlobal: true,
      trainerId: null,
      startDate: startDate ? new Date(startDate) : undefined,
      workouts: {
        create: workouts.map((w) => ({
          name: w.name,
          description: w.description,
          dayIndex: w.dayIndex,
          weekIndex: w.weekIndex,
          orderIndex: w.orderIndex,
          estimatedMinutes: w.estimatedMinutes,
          videoUrl: w.videoUrl ?? null,
          videoDurationSec: w.videoDurationSec ?? null,
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
                    create: e.sets.map((s) => ({
                      orderIndex: s.orderIndex,
                      setType: s.setType,
                      targetReps: s.targetReps,
                      targetWeight: s.targetWeight,
                      targetDuration: s.targetDuration,
                      targetDistance: s.targetDistance,
                      targetRPE: s.targetRPE,
                      restAfter: s.restAfter,
                    })),
                  },
                })),
              },
            })),
          },
        })),
      },
    },
    include: programDetailInclude,
  });
}

export async function updateGlobalProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  const { workouts, startDate, ...rest } = data;

  if (workouts) {
    // Assert target is actually a global program before destructively deleting workouts
    const target = await prisma.program.findFirst({ where: { id, isGlobal: true }, select: { id: true } });
    if (!target) throw new Error("Global program not found");

    await prisma.workout.deleteMany({ where: { programId: id } });

    return prisma.program.update({
      where: { id, isGlobal: true },
      data: {
        ...rest,
        status: rest.status as PlanStatus | undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        workouts: {
          create: workouts.map((w) => ({
            name: w.name,
            description: w.description,
            dayIndex: w.dayIndex,
            weekIndex: w.weekIndex,
            orderIndex: w.orderIndex,
            estimatedMinutes: w.estimatedMinutes,
            videoUrl: w.videoUrl ?? null,
            videoDurationSec: w.videoDurationSec ?? null,
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
                      create: e.sets.map((s) => ({
                        orderIndex: s.orderIndex,
                        setType: s.setType,
                        targetReps: s.targetReps,
                        targetWeight: s.targetWeight,
                        targetDuration: s.targetDuration,
                        targetDistance: s.targetDistance,
                        targetRPE: s.targetRPE,
                        restAfter: s.restAfter,
                      })),
                    },
                  })),
                },
              })),
            },
          })),
        },
      },
      include: programDetailInclude,
    });
  }

  return prisma.program.update({
    where: { id, isGlobal: true },
    data: {
      ...rest,
      status: rest.status as PlanStatus | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
    },
    include: programDetailInclude,
  });
}

export async function pushGlobalProgramUpdate(id: string) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { globalUpdatedAt: new Date() },
    select: { id: true, globalUpdatedAt: true },
  });
}

export async function assignGlobalProgramOrganizations(
  id: string,
  organizationIds: string[]
) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { organizationIds },
  });
}

export async function deleteGlobalProgram(id: string) {
  return prisma.program.update({
    where: { id, isGlobal: true },
    data: { status: "ARCHIVED" },
  });
}

export async function copyGlobalProgramToOrganization(
  globalProgramId: string,
  trainerId: string
) {
  const source = await getProgramById(globalProgramId);
  if (!source) throw new Error("Program not found");
  if (!source.isGlobal && !source.isPublic) {
    throw new Error("Program is not available to copy");
  }
  return duplicateProgram(globalProgramId, trainerId, false);
}
