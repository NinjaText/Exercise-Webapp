"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { submitFeedbackSchema, respondToFeedbackSchema } from "@/lib/validators/feedback";
import * as feedbackService from "@/lib/services/feedback.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import type { FeedbackRating } from "@prisma/client";

export async function submitFeedbackAction(input: {
  planExerciseId: string;
  rating: string;
  comment?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLIENT") return { success: false as const, error: "Forbidden" };

  const parsed = submitFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const pe = await prisma.planExercise.findUnique({
    where: { id: parsed.data.planExerciseId },
    select: { plan: { select: { clientId: true } } },
  });
  if (!pe || pe.plan.clientId !== dbUser.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const feedback = await feedbackService.submitFeedback({
      planExerciseId: parsed.data.planExerciseId,
      clientId: dbUser.id,
      rating: parsed.data.rating as FeedbackRating,
      comment: parsed.data.comment,
    });

    revalidatePath("/workout-plans");
    return { success: true as const, data: feedback };
  } catch (error) {
    console.error("Failed to submit feedback:", error);
    return { success: false as const, error: "Failed to submit feedback" };
  }
}

export interface PendingFeedbackItem {
  id: string;
  rating: string;
  comment: string | null;
  trainerResponse: string | null;
  createdAt: Date;
  exerciseName: string;
  clientName: string;
}

/**
 * Every unanswered piece of exercise feedback across the trainer's clients,
 * flattened to the shape `<FeedbackList />` renders. Powers the dashboard's
 * Pending Feedback slide-over, which loads on open rather than on page render.
 */
export async function getPendingFeedbackAction() {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  try {
    const feedback = await feedbackService.getPendingFeedbackForTrainer(dbUser.id);
    const data: PendingFeedbackItem[] = feedback.map((item) => ({
      id: item.id,
      rating: item.rating,
      comment: item.comment,
      trainerResponse: item.trainerResponse,
      createdAt: item.createdAt,
      exerciseName: item.planExercise.exercise.name,
      clientName: `${item.client.firstName} ${item.client.lastName}`,
    }));
    return { success: true as const, data };
  } catch (error) {
    console.error("Failed to fetch pending feedback:", error);
    return { success: false as const, error: "Failed to load pending feedback" };
  }
}

export async function respondToFeedbackAction(input: {
  feedbackId: string;
  trainerResponse: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };

  const parsed = respondToFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const feedback = await prisma.exerciseFeedback.findUnique({
    where: { id: parsed.data.feedbackId },
    select: { clientId: true },
  });
  if (!feedback) {
    return { success: false as const, error: "Feedback not found" };
  }
  const clientIds = await getClientIdsForTrainer(dbUser.id);
  if (!clientIds.includes(feedback.clientId)) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await feedbackService.respondToFeedback(parsed.data.feedbackId, parsed.data.trainerResponse);
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to respond to feedback:", error);
    return { success: false as const, error: "Failed to respond" };
  }
}
