import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth/active-user", () => ({ activeCallerOnly: vi.fn(async (user: unknown) => user) }));
vi.mock("@/lib/r2", () => ({
  getR2Client: vi.fn(() => ({})),
  R2_BUCKET_NAME: "bucket",
  R2_PUBLIC_URL: "https://cdn.example.com",
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn(async () => "https://signed.example.com") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/client.service", () => ({ getClientIdsForTrainer: vi.fn() }));
vi.mock("@/lib/org-capabilities.server", () => ({ filterCoachableClientIds: vi.fn() }));
vi.mock("@/lib/services/audit-log.service", () => ({
  logUserAudit: vi.fn(),
  AUDIT_ACTIONS: {
    REFLECTION_SCHEDULED: "REFLECTION_SCHEDULED",
    REFLECTION_UPDATED: "REFLECTION_UPDATED",
    REFLECTION_DELETED: "REFLECTION_DELETED",
  },
}));
vi.mock("@/lib/services/reflection-ai.service", () => ({
  generateReflectionOptions: vi.fn(),
  generateProgramPlanReflections: vi.fn(),
}));
vi.mock("@/lib/services/reflection.service", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/services/reflection.service")>();
  return {
    ReflectionError: actual.ReflectionError,
    getOwnedProgram: vi.fn(),
    upsertProgramReflection: vi.fn(),
    scheduleClientReflections: vi.fn(),
    updateReflections: vi.fn(),
    deleteReflections: vi.fn(),
    getProgramPlan: vi.fn(),
    fillProgramDays: vi.fn(),
    deleteProgramReflection: vi.fn(),
  };
});

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { filterCoachableClientIds } from "@/lib/org-capabilities.server";
import { logUserAudit } from "@/lib/services/audit-log.service";
import * as reflectionService from "@/lib/services/reflection.service";
import * as reflectionAiService from "@/lib/services/reflection-ai.service";
import {
  createReflectionAction,
  deleteReflectionsAction,
  fillProgramPlanWithAiAction,
  generateReflectionImageUploadUrlAction,
  updateReflectionsAction,
} from "../reflection-actions";

const TRAINER_ID = "a".repeat(24);
const CLIENT_A = "b".repeat(24);
const CLIENT_B = "c".repeat(24);
const PROGRAM_ID = "d".repeat(24);

const trainer = { id: TRAINER_ID, clerkId: "clerk_t", role: "TRAINER", firstName: "T", lastName: "R", email: "t@x.com", clerkOrgId: "org" };
const client = { ...trainer, id: CLIENT_A, clerkId: "clerk_c", role: "CLIENT" };

const content = {
  kind: "QUESTION",
  text: "What went well?",
  author: null,
  guidance: null,
  theme: "Progress",
  imageUrl: null,
  source: "CUSTOM",
  allowJournal: true,
  allowShare: true,
};

function signInAs(user: typeof trainer | null) {
  vi.mocked(auth).mockResolvedValue({ userId: user?.clerkId ?? null } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(trainer);
  vi.mocked(getClientIdsForTrainer).mockResolvedValue([CLIENT_A, CLIENT_B]);
  vi.mocked(filterCoachableClientIds).mockImplementation(async (_trainer, ids) => ids);
});

describe("createReflectionAction", () => {
  const single = { mode: "single", date: "2026-10-23" };

  it("rejects non-trainers", async () => {
    signInAs(client);

    const result = await createReflectionAction({ content, target: { type: "clients", audience: "all", clientIds: [], schedule: single } });

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(reflectionService.scheduleClientReflections).not.toHaveBeenCalled();
  });

  it("rejects a client outside the trainer's roster", async () => {
    const result = await createReflectionAction({
      content,
      target: { type: "clients", audience: "selected", clientIds: [CLIENT_A, "e".repeat(24)], schedule: single },
    });

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(reflectionService.scheduleClientReflections).not.toHaveBeenCalled();
  });

  it("fans out to the whole roster for 'all clients' and audits it", async () => {
    vi.mocked(reflectionService.scheduleClientReflections).mockResolvedValue({ count: 6 });

    const result = await createReflectionAction({
      content,
      target: {
        type: "clients",
        audience: "all",
        clientIds: [],
        schedule: { mode: "recurring", weekdays: [1, 3, 5], startDate: "2026-10-19", endDate: "2026-10-25" },
      },
    });

    expect(result).toEqual({ success: true, data: { count: 6 } });
    const call = vi.mocked(reflectionService.scheduleClientReflections).mock.calls[0][0];
    expect(call.clientIds).toEqual([CLIENT_A, CLIENT_B]);
    expect(call.dates).toHaveLength(3);
    expect(logUserAudit).toHaveBeenCalledTimes(1);
  });

  it("only schedules for coachable clients (club house coach vs uncoached members)", async () => {
    vi.mocked(filterCoachableClientIds).mockResolvedValue([CLIENT_A]);
    vi.mocked(reflectionService.scheduleClientReflections).mockResolvedValue({ count: 1 });

    const all = await createReflectionAction({ content, target: { type: "clients", audience: "all", clientIds: [], schedule: single } });
    expect(all.success).toBe(true);
    expect(vi.mocked(reflectionService.scheduleClientReflections).mock.calls[0][0].clientIds).toEqual([CLIENT_A]);

    const uncoached = await createReflectionAction({
      content,
      target: { type: "clients", audience: "selected", clientIds: [CLIENT_B], schedule: single },
    });
    expect(uncoached).toEqual({ success: false, error: "Unauthorized" });
  });

  it("rejects a recurring range longer than 180 days", async () => {
    const result = await createReflectionAction({
      content,
      target: {
        type: "clients",
        audience: "all",
        clientIds: [],
        schedule: { mode: "recurring", weekdays: [1], startDate: "2026-01-01", endDate: "2026-12-31" },
      },
    });

    expect(result.success).toBe(false);
    expect(reflectionService.scheduleClientReflections).not.toHaveBeenCalled();
  });

  it("surfaces the fan-out cap as a readable error", async () => {
    vi.mocked(reflectionService.scheduleClientReflections).mockRejectedValue(
      new reflectionService.ReflectionError("too_many_rows", "That schedule would create 2400 reflections")
    );

    const result = await createReflectionAction({ content, target: { type: "clients", audience: "all", clientIds: [], schedule: single } });

    expect(result).toEqual({ success: false, error: "That schedule would create 2400 reflections" });
  });

  it("refuses an image the trainer didn't upload", async () => {
    const result = await createReflectionAction({
      content: { ...content, imageUrl: "https://evil.example.com/x.png" },
      target: { type: "clients", audience: "all", clientIds: [], schedule: single },
    });

    expect(result).toEqual({ success: false, error: "Invalid image" });
  });

  it("accepts the trainer's own uploaded image", async () => {
    vi.mocked(reflectionService.scheduleClientReflections).mockResolvedValue({ count: 2 });

    const result = await createReflectionAction({
      content: { ...content, imageUrl: `https://cdn.example.com/reflections/${TRAINER_ID}/img.png` },
      target: { type: "clients", audience: "all", clientIds: [], schedule: single },
    });

    expect(result.success).toBe(true);
  });

  it("places a program reflection only on a program the trainer owns", async () => {
    vi.mocked(reflectionService.getOwnedProgram).mockResolvedValue(null);

    const result = await createReflectionAction({ content, target: { type: "program", programId: PROGRAM_ID, dayNumber: 3 } });

    expect(result).toEqual({ success: false, error: "Program not found" });
    expect(reflectionService.upsertProgramReflection).not.toHaveBeenCalled();
  });

  it("stores day N of a program as dayIndex N-1", async () => {
    vi.mocked(reflectionService.getOwnedProgram).mockResolvedValue({ id: PROGRAM_ID, name: "P" } as never);
    vi.mocked(reflectionService.upsertProgramReflection).mockResolvedValue({ id: "r1" } as never);

    const result = await createReflectionAction({ content, target: { type: "program", programId: PROGRAM_ID, dayNumber: 3 } });

    expect(result.success).toBe(true);
    expect(vi.mocked(reflectionService.upsertProgramReflection).mock.calls[0][0]).toMatchObject({ programId: PROGRAM_ID, dayIndex: 2 });
  });
});

describe("updateReflectionsAction", () => {
  it("reports not found when none of the ids are the trainer's", async () => {
    vi.mocked(reflectionService.updateReflections).mockResolvedValue({ count: 0 });

    const result = await updateReflectionsAction({ ids: [CLIENT_A], content });

    expect(result).toEqual({ success: false, error: "Reflection not found" });
    expect(logUserAudit).not.toHaveBeenCalled();
  });

  it("scopes edits to the trainer's current roster", async () => {
    vi.mocked(reflectionService.updateReflections).mockResolvedValue({ count: 1 });

    await updateReflectionsAction({ ids: [PROGRAM_ID], content });

    expect(vi.mocked(reflectionService.updateReflections).mock.calls[0][3]).toEqual([CLIENT_A, CLIENT_B]);
  });
});

describe("deleteReflectionsAction", () => {
  it("scopes deletes to the trainer's current roster", async () => {
    vi.mocked(reflectionService.deleteReflections).mockResolvedValue({ count: 1 });

    const result = await deleteReflectionsAction({ ids: [PROGRAM_ID] });

    expect(result.success).toBe(true);
    expect(vi.mocked(reflectionService.deleteReflections).mock.calls[0][2]).toEqual([CLIENT_A, CLIENT_B]);
  });
});

describe("fillProgramPlanWithAiAction", () => {
  it("generates only for empty days and saves them as AI reflections", async () => {
    vi.mocked(reflectionService.getProgramPlan).mockResolvedValue({
      program: { id: PROGRAM_ID, name: "P", isTemplate: true, totalDays: 3 },
      days: [
        { dayNumber: 1, workoutName: null, reflection: { id: "r1" } as never },
        { dayNumber: 2, workoutName: null, reflection: null },
        { dayNumber: 3, workoutName: null, reflection: null },
      ],
    });
    vi.mocked(reflectionAiService.generateProgramPlanReflections).mockResolvedValue([
      { dayNumber: 2, kind: "PROMPT", text: "Two", guidance: null },
      { dayNumber: 3, kind: "PROMPT", text: "Three", guidance: null },
    ]);
    vi.mocked(reflectionService.fillProgramDays).mockResolvedValue({ count: 2 });

    const result = await fillProgramPlanWithAiAction({ programId: PROGRAM_ID, theme: "Mindset", tone: "Calm", kind: "MIXED" });

    expect(result).toEqual({ success: true, data: { count: 2, remaining: 0 } });
    expect(vi.mocked(reflectionAiService.generateProgramPlanReflections).mock.calls[0][0].dayNumbers).toEqual([2, 3]);
    const saved = vi.mocked(reflectionService.fillProgramDays).mock.calls[0][0].days;
    expect(saved.map((d) => d.dayIndex)).toEqual([1, 2]);
    expect(saved[0].content.source).toBe("AI");
  });
});

describe("generateReflectionImageUploadUrlAction", () => {
  it("rejects files over 5 MB", async () => {
    const result = await generateReflectionImageUploadUrlAction({ contentType: "image/png", fileSize: 6 * 1024 * 1024 });

    expect(result.success).toBe(false);
  });

  it("returns a key scoped to the trainer", async () => {
    const result = await generateReflectionImageUploadUrlAction({ contentType: "image/png", fileSize: 1000 });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fileUrl).toMatch(new RegExp(`^https://cdn.example.com/reflections/${TRAINER_ID}/.+\\.png$`));
  });
});
