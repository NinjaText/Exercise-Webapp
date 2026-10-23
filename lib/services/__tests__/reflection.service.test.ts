import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reflection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
    program: { findMany: vi.fn(), findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}));
vi.mock("@/lib/services/client.service", () => ({ getTrainersForClient: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getTrainersForClient } from "@/lib/services/client.service";
import {
  ReflectionError,
  deleteReflections,
  fillProgramDays,
  findReflectionForDay,
  getProgramPlan,
  getTodaysReflection,
  scheduleClientReflections,
  updateReflections,
  listUpcomingClientReflections,
} from "../reflection.service";
import type { ReflectionContentInput } from "@/lib/validators/reflection";

const mocks = {
  findFirst: vi.mocked(prisma.reflection.findFirst),
  findMany: vi.mocked(prisma.reflection.findMany),
  createMany: vi.mocked(prisma.reflection.createMany),
  updateMany: vi.mocked(prisma.reflection.updateMany),
  deleteMany: vi.mocked(prisma.reflection.deleteMany),
  programFindMany: vi.mocked(prisma.program.findMany),
  programFindUnique: vi.mocked(prisma.program.findUnique),
};

const content: ReflectionContentInput = {
  kind: "QUESTION",
  text: "What went well today?",
  author: null,
  guidance: null,
  theme: "Progress",
  imageUrl: null,
  source: "CUSTOM",
  allowJournal: true,
  allowShare: false,
};

const NOW = new Date("2026-10-22T15:00:00Z");
const TODAY = new Date("2026-10-22T00:00:00Z");

function row(overrides: Record<string, unknown>) {
  return { id: "r", kind: "PROMPT", text: "t", author: null, guidance: null, theme: null, imageUrl: null, source: "CUSTOM", allowJournal: true, allowShare: true, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTrainersForClient).mockResolvedValue([{ id: "t1" }] as never);
});

describe("scheduleClientReflections", () => {
  it("replaces this trainer's rows for the same client/date pairs, then creates one row per pair", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 } as never);
    mocks.createMany.mockResolvedValue({ count: 4 } as never);
    const dates = [new Date("2026-10-23T10:00:00Z"), new Date("2026-10-24T00:00:00Z")];

    const result = await scheduleClientReflections({ trainerId: "t1", clientIds: ["c1", "c2", "c1"], dates, content });

    expect(result.count).toBe(4);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        trainerId: "t1",
        clientId: { in: ["c1", "c2"] },
        date: { in: [new Date("2026-10-23T00:00:00Z"), new Date("2026-10-24T00:00:00Z")] },
      },
    });
    const data = mocks.createMany.mock.calls[0][0]!.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(4);
    expect(data[0]).toMatchObject({ trainerId: "t1", clientId: "c1", programId: null, allowShare: false });
  });

  it("refuses a fan-out over 2,000 rows without writing anything", async () => {
    const clientIds = Array.from({ length: 21 }, (_, i) => `c${i}`);
    const dates = Array.from({ length: 100 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)));

    await expect(scheduleClientReflections({ trainerId: "t1", clientIds, dates, content })).rejects.toMatchObject({
      code: "too_many_rows",
    });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("refuses an empty target", async () => {
    await expect(
      scheduleClientReflections({ trainerId: "t1", clientIds: [], dates: [TODAY], content })
    ).rejects.toBeInstanceOf(ReflectionError);
  });
});

describe("roster scoping of scheduled rows", () => {
  it("updates only the trainer's rows for clients still on the roster", async () => {
    mocks.updateMany.mockResolvedValue({ count: 2 } as never);

    await updateReflections("t1", ["a", "b"], content, ["c1"]);

    expect(mocks.updateMany.mock.calls[0][0]!.where).toEqual({
      id: { in: ["a", "b"] },
      trainerId: "t1",
      clientId: { in: ["c1"] },
    });
  });

  it("deletes only the trainer's rows for clients still on the roster", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 } as never);

    await deleteReflections("t1", ["a"], ["c1"]);

    expect(mocks.deleteMany.mock.calls[0][0]!.where).toEqual({ id: { in: ["a"] }, trainerId: "t1", clientId: { in: ["c1"] } });
  });

  it("lists only roster clients, and nothing for an empty roster", async () => {
    mocks.findMany.mockResolvedValue([] as never);

    await listUpcomingClientReflections("t1", NOW, ["c1"]);
    expect(mocks.findMany.mock.calls[0][0]!.where).toMatchObject({ trainerId: "t1", clientId: { in: ["c1"] } });

    mocks.findMany.mockClear();
    expect(await listUpcomingClientReflections("t1", NOW, [])).toEqual([]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});

describe("getTodaysReflection", () => {
  it("prefers a reflection scheduled for the client on that day by a trainer in their org", async () => {
    mocks.findMany.mockResolvedValueOnce([row({ id: "dated", text: "Dated" })] as never);
    mocks.programFindMany.mockResolvedValue([] as never);

    const result = await getTodaysReflection("c1", NOW);

    expect(result).toMatchObject({ reflectionId: "dated", libraryId: null, origin: "SCHEDULED", text: "Dated", date: TODAY });
    expect(mocks.findMany.mock.calls[0][0]!.where).toEqual({ clientId: "c1", date: TODAY, trainerId: { in: ["t1"] } });
  });

  it("never shows a former trainer's rows: with no trainer in the org, dated rows aren't queried", async () => {
    vi.mocked(getTrainersForClient).mockResolvedValue([]);
    mocks.programFindMany.mockResolvedValue([] as never);

    const result = await getTodaysReflection("c1", NOW);

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(result.origin).toBe("LIBRARY");
  });

  it("falls back to the program day, preferring the client's copy over the template", async () => {
    mocks.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        row({ id: "from-template", programId: "tpl", dayIndex: 2 }),
        row({ id: "from-copy", programId: "copy", dayIndex: 2 }),
      ] as never);
    mocks.programFindMany.mockResolvedValue([
      { id: "copy", sourceTemplateId: "tpl", startDate: new Date("2026-10-20T00:00:00Z"), schedulingType: null, tags: [] },
    ] as never);

    const result = await getTodaysReflection("c1", NOW);

    expect(result).toMatchObject({ reflectionId: "from-copy", origin: "PROGRAM" });
    expect(mocks.findMany.mock.calls[1][0]!.where).toEqual({
      OR: [{ programId: { in: ["copy", "tpl"] }, dayIndex: 2 }],
    });
  });

  it("resolves a template's plan for an assigned copy (sourceTemplateId)", async () => {
    mocks.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([row({ id: "from-template", programId: "tpl", dayIndex: 0 })] as never);
    mocks.programFindMany.mockResolvedValue([
      { id: "copy", sourceTemplateId: "tpl", startDate: new Date("2026-10-22T00:00:00Z"), schedulingType: "SCHEDULED", tags: [] },
    ] as never);

    const result = await getTodaysReflection("c1", NOW);

    expect(result.reflectionId).toBe("from-template");
  });

  it("ignores Resource and ad-hoc programs and uses the library when nothing matches", async () => {
    mocks.findMany.mockResolvedValueOnce([] as never);
    mocks.programFindMany.mockResolvedValue([
      { id: "res", sourceTemplateId: null, startDate: TODAY, schedulingType: "ON_DEMAND", tags: [] },
      { id: "adhoc", sourceTemplateId: null, startDate: TODAY, schedulingType: null, tags: ["ad-hoc"] },
    ] as never);

    const result = await getTodaysReflection("c1", NOW);

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ reflectionId: null, origin: "LIBRARY", allowJournal: true, allowShare: true });
    expect(result.libraryId).toBeTruthy();
  });

  it("only considers the client's own ACTIVE programs that have started", async () => {
    mocks.findMany.mockResolvedValueOnce([] as never);
    mocks.programFindMany.mockResolvedValue([] as never);

    await getTodaysReflection("c1", NOW);

    expect(mocks.programFindMany.mock.calls[0][0]!.where).toEqual({
      clientId: "c1",
      status: "ACTIVE",
      startDate: { lte: TODAY },
    });
  });
});

describe("findReflectionForDay", () => {
  it("returns the exact reflection the card showed, even when it is no longer the top one", async () => {
    mocks.findMany.mockResolvedValueOnce([row({ id: "newer" }), row({ id: "shown", allowShare: false })] as never);
    mocks.programFindMany.mockResolvedValue([] as never);

    const result = await findReflectionForDay("c1", TODAY, { reflectionId: "shown", libraryId: null });

    expect(result).toMatchObject({ reflectionId: "shown", allowShare: false });
  });

  it("rejects a reflection that isn't one of this client's for that day", async () => {
    mocks.findMany.mockResolvedValueOnce([row({ id: "mine" })] as never);
    mocks.programFindMany.mockResolvedValue([] as never);

    expect(await findReflectionForDay("c1", TODAY, { reflectionId: "someone-elses", libraryId: null })).toBeNull();
  });

  it("accepts only the library entry of that day for a fallback", async () => {
    mocks.findMany.mockResolvedValue([] as never);
    mocks.programFindMany.mockResolvedValue([] as never);
    const today = await getTodaysReflection("c1", TODAY);

    expect(await findReflectionForDay("c1", TODAY, { reflectionId: null, libraryId: today.libraryId })).not.toBeNull();
    expect(await findReflectionForDay("c1", TODAY, { reflectionId: null, libraryId: "not-today" })).toBeNull();
  });
});

describe("getProgramPlan", () => {
  it("rejects a program the trainer doesn't own", async () => {
    mocks.programFindUnique.mockResolvedValue({ id: "p1", trainerId: "someone_else", workouts: [] } as never);

    await expect(getProgramPlan("t1", "p1")).rejects.toMatchObject({ code: "program_not_found" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("spans the workouts, the duration and existing reflections", async () => {
    mocks.programFindUnique.mockResolvedValue({
      id: "p1",
      name: "Knee rehab",
      trainerId: "t1",
      clientId: null,
      durationWeeks: 2,
      workouts: [{ name: "Week 3 day 1", weekIndex: 2, dayIndex: 0 }],
    } as never);
    mocks.findMany.mockResolvedValue([row({ id: "r9", dayIndex: 8, text: "Day nine" })] as never);

    const plan = await getProgramPlan("t1", "p1");

    expect(plan.program).toMatchObject({ isTemplate: true, totalDays: 15 });
    expect(plan.days[8]).toMatchObject({ dayNumber: 9, reflection: { id: "r9", text: "Day nine" } });
    expect(plan.days[14]).toMatchObject({ dayNumber: 15, workoutName: "Week 3 day 1", reflection: null });
  });
});

describe("fillProgramDays", () => {
  it("never overwrites a day that already has a reflection", async () => {
    mocks.findMany.mockResolvedValue([{ dayIndex: 1 }] as never);
    mocks.createMany.mockResolvedValue({ count: 1 } as never);

    await fillProgramDays({
      trainerId: "t1",
      programId: "p1",
      days: [
        { dayIndex: 0, content },
        { dayIndex: 1, content },
      ],
    });

    const data = mocks.createMany.mock.calls[0][0]!.data as Array<Record<string, unknown>>;
    expect(data.map((d) => d.dayIndex)).toEqual([0]);
  });
});
