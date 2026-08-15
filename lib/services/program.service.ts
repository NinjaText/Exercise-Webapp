import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { PlanStatus, Prisma } from "@prisma/client";

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
  client: { select: { id: true, firstName: true, lastName: true } },
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

export async function createProgram(
  trainerId: string,
  data: CreateProgramInput
) {
  const { workouts, startDate, organizationIds, ...rest } = data;
  void organizationIds;

  // Create the program shell, then bulk-insert the workout tree one LEVEL at a
  // time via createMany. A single deeply-nested `create` (workouts → blocks →
  // exercises → sets) inserts every descendant in its own round-trip — hundreds
  // of them for a real program, ~250ms each on a remote DB, minutes total (and
  // the wrapping transaction can abort). Pre-generating ObjectIds lets each
  // child row reference its parent, so the whole tree is 4 bulk inserts.
  const program = await prisma.program.create({
    data: {
      ...rest,
      trainerId,
      startDate: startDate ? new Date(startDate) : undefined,
    },
  });

  const workoutRows: Prisma.WorkoutCreateManyInput[] = [];
  const blockRows: Prisma.WorkoutBlockV2CreateManyInput[] = [];
  const exerciseRows: Prisma.BlockExerciseV2CreateManyInput[] = [];
  const setRows: Prisma.ExerciseSetCreateManyInput[] = [];

  for (const w of workouts) {
    const workoutId = newObjectId();
    workoutRows.push({
      id: workoutId,
      programId: program.id,
      name: w.name,
      description: w.description,
      dayIndex: w.dayIndex,
      weekIndex: w.weekIndex,
      orderIndex: w.orderIndex,
      estimatedMinutes: w.estimatedMinutes,
    });
    for (const b of w.blocks) {
      const blockId = newObjectId();
      blockRows.push({
        id: blockId,
        workoutId,
        name: b.name,
        type: b.type,
        orderIndex: b.orderIndex,
        rounds: b.rounds,
        restBetweenRounds: b.restBetweenRounds,
        timeCap: b.timeCap,
        notes: b.notes,
      });
      for (const e of b.exercises) {
        const blockExerciseId = newObjectId();
        exerciseRows.push({
          id: blockExerciseId,
          blockId,
          exerciseId: e.exerciseId,
          orderIndex: e.orderIndex,
          activityType: e.activityType,
          restSeconds: e.restSeconds,
          notes: e.notes,
          supersetGroup: e.supersetGroup,
        });
        for (const s of e.sets) {
          setRows.push({
            id: newObjectId(),
            blockExerciseId,
            orderIndex: s.orderIndex,
            setType: s.setType,
            targetReps: s.targetReps,
            targetWeight: s.targetWeight,
            targetDuration: s.targetDuration,
            targetDurationUnit: s.targetDurationUnit,
            targetDistance: s.targetDistance,
            targetPace: s.targetPace,
            targetHrZone: s.targetHrZone,
            repeatCount: s.repeatCount,
            targetRPE: s.targetRPE,
            restAfter: s.restAfter,
          });
        }
      }
    }
  }

  if (workoutRows.length) await prisma.workout.createMany({ data: workoutRows });
  if (blockRows.length) await prisma.workoutBlockV2.createMany({ data: blockRows });
  if (exerciseRows.length) await prisma.blockExerciseV2.createMany({ data: exerciseRows });
  if (setRows.length) await prisma.exerciseSet.createMany({ data: setRows });

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

  return prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateProgram(
  id: string,
  data: Partial<CreateProgramInput> & { status?: string }
) {
  const { workouts, startDate, ...rest } = data;

  if (workouts) {
    // Delete all existing workouts (cascades to blocks -> exercises -> sets)
    await prisma.workout.deleteMany({ where: { programId: id } });

    return prisma.program.update({
      where: { id },
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
                    activityType: e.activityType,
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
                        targetDurationUnit: s.targetDurationUnit,
                        targetDistance: s.targetDistance,
                        targetPace: s.targetPace,
                        targetHrZone: s.targetHrZone,
                        repeatCount: s.repeatCount,
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
    where: { id },
    data: {
      ...rest,
      status: rest.status as PlanStatus | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
    },
    include: programDetailInclude,
  });
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

export async function duplicateProgram(
  id: string,
  trainerId: string,
  asTemplate = false
) {
  const source = await getProgramById(id);
  if (!source) throw new Error("Program not found");

  const workouts = source.workouts.map((w, wi) => ({
    name: w.name,
    description: w.description,
    dayIndex: w.dayIndex,
    weekIndex: w.weekIndex,
    orderIndex: wi,
    estimatedMinutes: w.estimatedMinutes,
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

  return createProgram(trainerId, {
    name: `${source.name} (Copy)`,
    description: source.description,
    isTemplate: asTemplate,
    sourceTemplateId: source.id,
    durationWeeks: source.durationWeeks,
    daysPerWeek: source.daysPerWeek,
    tags: source.tags,
    equipmentRequired: source.equipmentRequired ?? [],
    organizationIds: [],
    workouts,
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

export async function getProgramsForClient(clientId: string) {
  return prisma.program.findMany({
    where: { clientId, status: { in: ["ACTIVE", "PAUSED"] } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTemplates(trainerId: string) {
  return prisma.program.findMany({
    where: { trainerId, isTemplate: true, status: { not: "ARCHIVED" } },
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

// --- Global Programs (super admin) ---

export async function getGlobalPrograms(clerkOrgId?: string) {
  const where: Prisma.ProgramWhereInput = {
    isGlobal: true,
    status: { not: "ARCHIVED" },
  };
  if (clerkOrgId) {
    where.OR = [
      { organizationIds: { isEmpty: true } },
      { organizationIds: { has: clerkOrgId } },
    ];
  }

  return prisma.program.findMany({
    where,
    include: programListInclude,
    orderBy: { updatedAt: "desc" },
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
  if (!source.isGlobal) throw new Error("Program is not a global program");
  return duplicateProgram(globalProgramId, trainerId, false);
}
