"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2";
import { pusherServer } from "@/lib/pusher";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { getClientIdsForTrainer, getTrainerForClient } from "@/lib/services/client.service";
import * as nutritionService from "@/lib/services/nutrition.service";
import * as nutritionAiService from "@/lib/services/nutrition-ai.service";
import {
  upsertNutritionTargetSchema,
  addWaterLogSchema,
  createNutritionCommentSchema,
  mealPhotoPresignSchema,
  mealPhotoConfirmSchema,
  analyzeMealPhotoSchema,
  estimateMealMacrosBatchSchema,
  bulkCreateNutritionLogSchema,
  updateMealGroupSchema,
  generateDailySummarySchema,
  generateWeeklyReviewSchema,
  MEAL_TYPES,
} from "@/lib/validators/nutrition";
import type {
  MealPhotoFoodDraft,
  MealMacroEstimate,
  DailyNutritionSummary,
  WeeklyNutritionReview,
} from "@/lib/services/nutrition-ai.service";

// ─── Types ───────────────────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getAuthedUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  return prisma.user.findUnique({ where: { clerkId } });
}

async function canTrainerAccessClient(trainerId: string, clientId: string): Promise<boolean> {
  const clientIds = await getClientIdsForTrainer(trainerId);
  return clientIds.includes(clientId);
}

// ─── Targets ─────────────────────────────────────────────────────────────────

export async function upsertNutritionTargetAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = upsertNutritionTargetSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { clientId, ...updates } = parsed.data;

  if (user.role === "TRAINER") {
    if (!(await canTrainerAccessClient(user.id, clientId))) {
      return { success: false, error: "Forbidden" };
    }
  } else if (user.id !== clientId) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const target = await nutritionService.updateNutritionTarget(clientId, user.role, updates);
    revalidatePath("/nutrition");
    revalidatePath(`/nutrition/${clientId}`);
    return { success: true, data: { id: target.id } };
  } catch (err) {
    console.error("[nutrition] upsertTarget error:", err);
    const message = err instanceof Error ? err.message : "Failed to update nutrition target";
    return { success: false, error: message };
  }
}

// ─── Meal Logs (client-only — clients log their own meals) ─────────────────

export async function deleteNutritionLogAction(logId: string): Promise<ActionResult> {
  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const log = await prisma.nutritionLog.findUnique({ where: { id: logId } });
  if (!log) return { success: false, error: "Not found" };
  if (user.role !== "CLIENT" || log.clientId !== user.id) {
    return { success: false, error: "Forbidden" };
  }

  try {
    await nutritionService.deleteNutritionLog(logId);
    revalidatePath("/nutrition");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("[nutrition] deleteLog error:", err);
    return { success: false, error: "Failed to delete meal" };
  }
}

export async function updateMealGroupAction(
  clientId: string,
  date: Date,
  mealType: string,
  input: unknown
): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = updateMealGroupSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  if (!MEAL_TYPES.includes(mealType as (typeof MEAL_TYPES)[number])) {
    return { success: false, error: "Invalid input" };
  }
  const parsedDate = z.coerce.date().safeParse(date);
  if (!parsedDate.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role === "CLIENT") {
    if (user.id !== clientId) return { success: false, error: "Forbidden" };
  } else if (user.role === "TRAINER") {
    if (!(await canTrainerAccessClient(user.id, clientId))) {
      return { success: false, error: "Forbidden" };
    }
  } else {
    return { success: false, error: "Forbidden" };
  }

  try {
    const { ids } = await nutritionService.updateMealGroup(clientId, parsedDate.data, mealType, parsed.data.items);
    revalidatePath("/nutrition");
    revalidatePath(`/nutrition/${clientId}`);
    return { success: true, data: { ids } };
  } catch (err) {
    console.error("[nutrition] updateMealGroup error:", err);
    const message = err instanceof Error ? err.message : "Failed to update meal";
    return { success: false, error: message };
  }
}

// ─── Water ───────────────────────────────────────────────────────────────────

export async function addWaterLogAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = addWaterLogSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "CLIENT" || user.id !== parsed.data.clientId) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const log = await nutritionService.addWaterLog(
      parsed.data.clientId,
      parsed.data.date,
      parsed.data.amountMl
    );
    revalidatePath("/nutrition");
    return { success: true, data: { id: log.id } };
  } catch (err) {
    console.error("[nutrition] addWaterLog error:", err);
    return { success: false, error: "Failed to log water" };
  }
}

// ─── Meal Photo Upload (R2 presign/confirm, mirrors voice-memo pattern) ────

export async function generateMealPhotoPresignedUrl(
  input: unknown
): Promise<ActionResult<{ presignedUrl: string; pendingKey: string }>> {
  const parsed = mealPhotoPresignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "CLIENT") return { success: false, error: "Forbidden" };

  try {
    const pendingKey = `nutrition-photos/pending/${randomUUID()}.${parsed.data.fileExtension}`;
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: pendingKey,
      ContentType: `image/${parsed.data.fileExtension}`,
    });
    const presignedUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 });

    return { success: true, data: { presignedUrl, pendingKey } };
  } catch (err) {
    console.error("[nutrition] photo presign error:", err);
    return { success: false, error: "Failed to generate upload URL" };
  }
}

export async function confirmMealPhotoUpload(
  input: unknown
): Promise<ActionResult<{ photoUrl: string }>> {
  const parsed = mealPhotoConfirmSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "CLIENT") return { success: false, error: "Forbidden" };

  try {
    const { pendingKey } = parsed.data;
    const ext = pendingKey.split(".").pop()!;
    const permanentKey = `nutrition-photos/${user.id}/${randomUUID()}.${ext}`;

    await getR2Client().send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET_NAME,
        CopySource: `${R2_BUCKET_NAME}/${pendingKey}`,
        Key: permanentKey,
      })
    );
    await getR2Client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: pendingKey }));

    return { success: true, data: { photoUrl: `${R2_PUBLIC_URL}/${permanentKey}` } };
  } catch (err) {
    console.error("[nutrition] photo confirm error:", err);
    return { success: false, error: "Failed to confirm upload" };
  }
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function createNutritionCommentAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = createNutritionCommentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { clientId, date, logId, body } = parsed.data;

  if (user.role === "TRAINER") {
    if (!(await canTrainerAccessClient(user.id, clientId))) {
      return { success: false, error: "Forbidden" };
    }
  } else if (user.id !== clientId) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const comment = await nutritionService.createNutritionComment({
      clientId,
      authorId: user.id,
      date,
      logId,
      body,
    });

    if (user.role === "TRAINER") {
      await createNotification({
        userId: clientId,
        type: NOTIFICATION_TYPES.NUTRITION_COMMENT,
        title: "New nutrition feedback",
        body: `${user.firstName} left a comment on your nutrition log.`,
        link: "/nutrition",
        metadata: { commentId: comment.id, logId: logId ?? null },
      });

      const client = await prisma.user.findUnique({ where: { id: clientId }, select: { clerkId: true } });
      if (client) {
        pusherServer
          .trigger(`client-${client.clerkId}`, "nutrition-comment-added", { commentId: comment.id })
          .catch((e) => console.error("[pusher] nutrition-comment-added:", e));
      }
    } else {
      const trainer = await getTrainerForClient(clientId);
      if (trainer) {
        await createNotification({
          userId: trainer.id,
          type: NOTIFICATION_TYPES.NUTRITION_REPLY,
          title: "Client replied on nutrition",
          body: `${user.firstName} ${user.lastName} replied on their nutrition log.`,
          link: `/nutrition/${clientId}`,
          metadata: { commentId: comment.id, clientId, logId: logId ?? null },
        });

        pusherServer
          .trigger(`trainer-${trainer.clerkId}`, "nutrition-reply-added", { commentId: comment.id, clientId })
          .catch((e) => console.error("[pusher] nutrition-reply-added:", e));
      }
    }

    revalidatePath("/nutrition");
    revalidatePath(`/nutrition/${clientId}`);
    return { success: true, data: { id: comment.id } };
  } catch (err) {
    console.error("[nutrition] createComment error:", err);
    return { success: false, error: "Failed to post comment" };
  }
}

// ─── AI Photo Analysis + Bulk Log Creation ──────────────────────────────────

export async function analyzeMealPhotoAction(
  input: unknown
): Promise<ActionResult<{ foods: MealPhotoFoodDraft[] }>> {
  const parsed = analyzeMealPhotoSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "CLIENT") return { success: false, error: "Forbidden" };

  try {
    const foods = await nutritionAiService.analyzeMealPhoto(parsed.data.photoUrl);
    return { success: true, data: { foods } };
  } catch (err) {
    console.error("[nutrition] analyzeMealPhoto error:", err);
    return { success: false, error: "Failed to analyze photo" };
  }
}

export async function estimateMealMacrosBatchAction(
  input: unknown
): Promise<ActionResult<{ estimates: MealMacroEstimate[] }>> {
  const parsed = estimateMealMacrosBatchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "CLIENT" && user.role !== "TRAINER") {
    return { success: false, error: "Forbidden" };
  }

  try {
    const estimates = await nutritionAiService.estimateMealMacrosBatch(parsed.data.items);
    return { success: true, data: { estimates } };
  } catch (err) {
    console.error("[nutrition] estimateMealMacrosBatch error:", err);
    return { success: false, error: "Failed to estimate macros" };
  }
}

export async function createNutritionLogsBulkAction(
  input: unknown
): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = bulkCreateNutritionLogSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "CLIENT" || user.id !== parsed.data.clientId) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const { clientId, date, mealType, logs } = parsed.data;
    const created = await Promise.all(
      logs.map((log) =>
        nutritionService.createNutritionLog({
          clientId,
          date,
          mealType,
          ...log,
        })
      )
    );
    revalidatePath("/nutrition");
    return { success: true, data: { ids: created.map((l) => l.id) } };
  } catch (err) {
    console.error("[nutrition] bulkCreateLogs error:", err);
    return { success: false, error: "Failed to save meals" };
  }
}

// ─── AI Summaries ────────────────────────────────────────────────────────────

export async function generateDailySummaryAction(
  input: unknown
): Promise<ActionResult<DailyNutritionSummary>> {
  const parsed = generateDailySummarySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { clientId, date, force } = parsed.data;
  if (user.role === "TRAINER") {
    if (!(await canTrainerAccessClient(user.id, clientId))) {
      return { success: false, error: "Forbidden" };
    }
  } else if (user.id !== clientId) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const summary = await nutritionAiService.generateDailyNutritionSummary(clientId, date, force);
    return { success: true, data: summary };
  } catch (err) {
    console.error("[nutrition] generateDailySummary error:", err);
    return { success: false, error: "Failed to generate summary" };
  }
}

export async function generateWeeklyReviewAction(
  input: unknown
): Promise<ActionResult<WeeklyNutritionReview>> {
  const parsed = generateWeeklyReviewSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const user = await getAuthedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { clientId, referenceDate, force } = parsed.data;
  if (user.role === "TRAINER") {
    if (!(await canTrainerAccessClient(user.id, clientId))) {
      return { success: false, error: "Forbidden" };
    }
  } else if (user.id !== clientId) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const review = await nutritionAiService.generateWeeklyNutritionReview(clientId, referenceDate, force);
    return { success: true, data: review };
  } catch (err) {
    console.error("[nutrition] generateWeeklyReview error:", err);
    return { success: false, error: "Failed to generate weekly review" };
  }
}
