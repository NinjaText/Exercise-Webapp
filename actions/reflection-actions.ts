"use server";

import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { activeCallerOnly } from "@/lib/auth/active-user";
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { filterCoachableClientIds } from "@/lib/org-capabilities.server";
import { logUserAudit, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import * as reflectionService from "@/lib/services/reflection.service";
import * as reflectionAiService from "@/lib/services/reflection-ai.service";
import type { GeneratedReflection } from "@/lib/services/reflection-ai.service";
import { ReflectionError, type ProgramPlanDay } from "@/lib/services/reflection.service";
import { AI_PLAN_MAX_DAYS, REFLECTION_IMAGE_PREFIX } from "@/lib/reflections/constants";
import { expandScheduleDates } from "@/lib/reflections/dates";
import {
  createReflectionSchema,
  deleteReflectionsSchema,
  fillProgramPlanSchema,
  generateReflectionOptionsSchema,
  programDaySchema,
  programIdSchema,
  reflectionImagePresignSchema,
  updateReflectionsSchema,
  upsertProgramDaySchema,
  type ReflectionContentInput,
} from "@/lib/validators/reflection";

// ─── Types ───────────────────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function getTrainer() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const user = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId } }));
  return user?.role === "TRAINER" ? user : null;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid input";
}

/**
 * Reflection images must be ones this trainer uploaded through
 * generateReflectionImageUploadUrlAction — never an arbitrary URL that would
 * be rendered on clients' dashboards.
 */
function isOwnReflectionImage(url: string | null, trainerId: string): boolean {
  if (!url) return true;
  return url.startsWith(`${R2_PUBLIC_URL}/${REFLECTION_IMAGE_PREFIX}/${trainerId}/`);
}

function revalidateReflectionViews() {
  revalidatePath("/reflections");
  revalidatePath("/dashboard");
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ReflectionError) {
    if (error.code === "program_not_found") return "Program not found";
    if (error.code === "no_targets") return "That schedule doesn't match any days";
    return error.message;
  }
  return fallback;
}

// ─── Create / schedule ───────────────────────────────────────────────────────

/**
 * Saves the Create flow: fans the reflection out to clients × dates, or places
 * it on one day of a program the trainer owns.
 */
export async function createReflectionAction(
  input: unknown
): Promise<ActionResult<{ count: number }>> {
  const parsed = createReflectionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };

  const { content, target } = parsed.data;
  if (!isOwnReflectionImage(content.imageUrl, user.id)) return { success: false, error: "Invalid image" };

  try {
    if (target.type === "program") {
      const program = await reflectionService.getOwnedProgram(user.id, target.programId);
      if (!program) return { success: false, error: "Program not found" };

      const reflection = await reflectionService.upsertProgramReflection({
        trainerId: user.id,
        programId: program.id,
        dayIndex: target.dayNumber - 1,
        content,
      });
      await logUserAudit(user, () => ({
        action: AUDIT_ACTIONS.REFLECTION_SCHEDULED,
        targetType: "Program",
        targetId: program.id,
        targetLabel: program.name,
        metadata: { reflectionId: reflection.id, dayNumber: target.dayNumber, source: content.source },
      }));
      revalidateReflectionViews();
      return { success: true, data: { count: 1 } };
    }

    // Coachable roster only: a club house coach can't reach uncoached members.
    const rosterIds = await filterCoachableClientIds(user, await getClientIdsForTrainer(user.id));
    let clientIds: string[];
    if (target.audience === "all") {
      clientIds = rosterIds;
    } else {
      const roster = new Set(rosterIds);
      if (target.clientIds.some((id) => !roster.has(id))) return { success: false, error: "Unauthorized" };
      clientIds = target.clientIds;
    }
    if (clientIds.length === 0) return { success: false, error: "You don't have any clients to schedule for yet" };

    const dates = expandScheduleDates(target.schedule);
    const { count } = await reflectionService.scheduleClientReflections({
      trainerId: user.id,
      clientIds,
      dates,
      content,
    });

    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.REFLECTION_SCHEDULED,
      targetType: "Reflection",
      targetLabel: content.text.slice(0, 80),
      metadata: {
        count,
        clientCount: new Set(clientIds).size,
        dayCount: dates.length,
        audience: target.audience,
        mode: target.schedule.mode,
        source: content.source,
      },
    }));
    revalidateReflectionViews();
    return { success: true, data: { count } };
  } catch (error) {
    console.error("[reflections] create error:", error);
    return { success: false, error: errorMessage(error, "Failed to save reflection") };
  }
}

/** Edits every row of a scheduled group (rows the trainer doesn't own are skipped). */
export async function updateReflectionsAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = updateReflectionsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!isOwnReflectionImage(parsed.data.content.imageUrl, user.id)) return { success: false, error: "Invalid image" };

  try {
    const roster = await getClientIdsForTrainer(user.id);
    const { count } = await reflectionService.updateReflections(user.id, parsed.data.ids, parsed.data.content, roster);
    if (count === 0) return { success: false, error: "Reflection not found" };
    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.REFLECTION_UPDATED,
      targetType: "Reflection",
      targetId: parsed.data.ids[0],
      targetLabel: parsed.data.content.text.slice(0, 80),
      metadata: { count },
    }));
    revalidateReflectionViews();
    return { success: true, data: { count } };
  } catch (error) {
    console.error("[reflections] update error:", error);
    return { success: false, error: "Failed to update reflection" };
  }
}

export async function deleteReflectionsAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = deleteReflectionsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const roster = await getClientIdsForTrainer(user.id);
    const { count } = await reflectionService.deleteReflections(user.id, parsed.data.ids, roster);
    if (count === 0) return { success: false, error: "Reflection not found" };
    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.REFLECTION_DELETED,
      targetType: "Reflection",
      targetId: parsed.data.ids[0],
      metadata: { count },
    }));
    revalidateReflectionViews();
    return { success: true, data: { count } };
  } catch (error) {
    console.error("[reflections] delete error:", error);
    return { success: false, error: "Failed to delete reflection" };
  }
}

// ─── Program plans ───────────────────────────────────────────────────────────

export async function getProgramPlanAction(input: unknown): Promise<
  ActionResult<{ program: { id: string; name: string; isTemplate: boolean; totalDays: number }; days: ProgramPlanDay[] }>
> {
  const parsed = programIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    return { success: true, data: await reflectionService.getProgramPlan(user.id, parsed.data.programId) };
  } catch (error) {
    if (!(error instanceof ReflectionError)) console.error("[reflections] plan load error:", error);
    return { success: false, error: errorMessage(error, "Failed to load program plan") };
  }
}

export async function upsertProgramDayAction(
  input: unknown
): Promise<ActionResult<{ id: string; sharedImageCount: number }>> {
  const parsed = upsertProgramDaySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!isOwnReflectionImage(parsed.data.content.imageUrl, user.id)) return { success: false, error: "Invalid image" };

  try {
    const program = await reflectionService.getOwnedProgram(user.id, parsed.data.programId);
    if (!program) return { success: false, error: "Program not found" };

    const reflection = await reflectionService.upsertProgramReflection({
      trainerId: user.id,
      programId: program.id,
      dayIndex: parsed.data.dayNumber - 1,
      content: parsed.data.content,
    });
    const otherDayIndexes = [...new Set(parsed.data.shareImageWithDays)]
      .filter((day) => day !== parsed.data.dayNumber)
      .map((day) => day - 1);
    const { count: sharedImageCount } =
      parsed.data.content.imageUrl && otherDayIndexes.length > 0
        ? await reflectionService.setProgramDaysImage(program.id, otherDayIndexes, parsed.data.content.imageUrl)
        : { count: 0 };
    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.REFLECTION_UPDATED,
      targetType: "Program",
      targetId: program.id,
      targetLabel: program.name,
      metadata: { reflectionId: reflection.id, dayNumber: parsed.data.dayNumber, sharedImageCount },
    }));
    revalidateReflectionViews();
    return { success: true, data: { id: reflection.id, sharedImageCount } };
  } catch (error) {
    console.error("[reflections] program day save error:", error);
    return { success: false, error: "Failed to save reflection" };
  }
}

export async function deleteProgramDayAction(input: unknown): Promise<ActionResult> {
  const parsed = programDaySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const program = await reflectionService.getOwnedProgram(user.id, parsed.data.programId);
    if (!program) return { success: false, error: "Program not found" };

    await reflectionService.deleteProgramReflection(program.id, parsed.data.dayNumber - 1);
    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.REFLECTION_DELETED,
      targetType: "Program",
      targetId: program.id,
      targetLabel: program.name,
      metadata: { dayNumber: parsed.data.dayNumber },
    }));
    revalidateReflectionViews();
    return { success: true, data: undefined };
  } catch (error) {
    console.error("[reflections] program day delete error:", error);
    return { success: false, error: "Failed to delete reflection" };
  }
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export async function generateReflectionOptionsAction(
  input: unknown
): Promise<ActionResult<GeneratedReflection[]>> {
  const parsed = generateReflectionOptionsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const options = await reflectionAiService.generateReflectionOptions(parsed.data);
    if (options.length === 0) return { success: false, error: "The AI didn't return any options — try again" };
    return { success: true, data: options };
  } catch (error) {
    console.error("[reflections] AI options error:", error);
    return { success: false, error: "Couldn't generate reflections right now. Please try again." };
  }
}

/**
 * Fills the program's empty days (up to AI_PLAN_MAX_DAYS of them, earliest
 * first) with AI reflections. Days the trainer already set are never touched.
 */
export async function fillProgramPlanWithAiAction(
  input: unknown
): Promise<ActionResult<{ count: number; remaining: number }>> {
  const parsed = fillProgramPlanSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };

  const { programId, ...style } = parsed.data;

  try {
    const plan = await reflectionService.getProgramPlan(user.id, programId);
    const emptyDays = plan.days.filter((day) => !day.reflection).map((day) => day.dayNumber);
    if (emptyDays.length === 0) return { success: true, data: { count: 0, remaining: 0 } };

    const requested = emptyDays.slice(0, AI_PLAN_MAX_DAYS);
    const generated = await reflectionAiService.generateProgramPlanReflections({
      style,
      dayNumbers: requested,
      totalDays: plan.program.totalDays,
      programName: plan.program.name,
    });

    const { count } = await reflectionService.fillProgramDays({
      trainerId: user.id,
      programId,
      days: generated.map((item) => ({
        dayIndex: item.dayNumber - 1,
        content: {
          kind: item.kind,
          text: item.text,
          author: null,
          guidance: item.guidance,
          theme: style.theme,
          imageUrl: null,
          source: "AI",
          allowJournal: true,
          allowShare: true,
        } satisfies ReflectionContentInput,
      })),
    });

    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.REFLECTION_SCHEDULED,
      targetType: "Program",
      targetId: programId,
      targetLabel: plan.program.name,
      metadata: { count, source: "AI", mode: "program_fill" },
    }));
    revalidateReflectionViews();
    return { success: true, data: { count, remaining: Math.max(0, emptyDays.length - count) } };
  } catch (error) {
    console.error("[reflections] AI plan fill error:", error);
    return { success: false, error: errorMessage(error, "Couldn't fill the plan right now. Please try again.") };
  }
}

// ─── Image upload (R2 presign) ───────────────────────────────────────────────

/**
 * Presigned PUT for a reflection image. ContentLength is part of the
 * signature, so the browser can't upload more than the size it declared.
 */
export async function generateReflectionImageUploadUrlAction(
  input: unknown
): Promise<ActionResult<{ presignedUrl: string; fileUrl: string }>> {
  const parsed = reflectionImagePresignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const user = await getTrainer();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const extension = IMAGE_EXTENSIONS[parsed.data.contentType];
    const key = `${REFLECTION_IMAGE_PREFIX}/${user.id}/${randomUUID()}.${extension}`;
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: parsed.data.contentType,
      ContentLength: parsed.data.fileSize,
    });
    const presignedUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 });
    return { success: true, data: { presignedUrl, fileUrl: `${R2_PUBLIC_URL}/${key}` } };
  } catch (error) {
    console.error("[reflections] image presign error:", error);
    return { success: false, error: "Failed to prepare the upload" };
  }
}
