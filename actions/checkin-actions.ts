"use server";

import { getCurrentUser, requireRole } from "@/lib/current-user";
import { revalidatePath } from "next/cache";
import * as checkinService from "@/lib/services/checkin.service";
import type { CreateTemplateInput } from "@/lib/services/checkin.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { appBaseUrl } from "@/lib/utils/app-url";
import { format } from "date-fns";

// ─── Trainer actions ────────────────────────────────────────────────────────

export async function createCheckInTemplateAction(data: CreateTemplateInput) {
  const user = await requireRole("TRAINER");

  if (!data.name?.trim()) {
    return { success: false as const, error: "Template name is required" };
  }
  if (!data.questions || data.questions.length === 0) {
    return {
      success: false as const,
      error: "At least one question is required",
    };
  }

  try {
    const template = await checkinService.createTemplate(user.id, data);
    revalidatePath("/check-ins");
    return { success: true as const, data: template };
  } catch (error) {
    console.error("Failed to create check-in template:", error);
    return {
      success: false as const,
      error: "Failed to create check-in template",
    };
  }
}

export async function assignCheckInAction(
  templateId: string,
  clientId: string
) {
  const user = await requireRole("TRAINER");

  if (!templateId || !clientId) {
    return { success: false as const, error: "Template and client are required" };
  }

  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(clientId)) {
    return { success: false as const, error: "Unauthorized" };
  }

  try {
    // Fetched before the write: a lookup failure here means nothing has
    // happened yet, so it's safe to return an honest error. Fetching this
    // after assignTemplateToClient() would mean a DB blip here reports
    // failure for an assignment that actually succeeded, inviting a retry
    // that creates a duplicate.
    const template = await prisma.checkInTemplate.findUnique({
      where: { id: templateId },
      select: { name: true },
    });

    const assignment = await checkinService.assignTemplateToClient(
      templateId,
      clientId,
      user.id
    );
    revalidatePath("/check-ins");
    revalidatePath(`/clients/${clientId}`);

    const checkInLink = `${appBaseUrl()}/check-ins`;

    await notifyUser({
      userId: clientId,
      type: NOTIFICATION_TYPES.CHECK_IN_DUE,
      title: "New check-in assigned",
      body: `Your trainer assigned you "${template?.name ?? "a check-in"}".`,
      link: "/check-ins",
      metadata: { assignmentId: assignment.id, templateId },
      email: {
        templateName: template?.name ?? "Check-in",
        dueDate: format(new Date(assignment.nextDueDate), "EEEE, MMMM d, yyyy"),
        checkInLink,
      },
    });

    return { success: true as const, data: assignment };
  } catch (error) {
    console.error("Failed to assign check-in:", error);
    return { success: false as const, error: "Failed to assign check-in" };
  }
}

export async function addCoachNotesAction(responseId: string, notes: string) {
  const user = await requireRole("TRAINER");

  if (!notes?.trim()) {
    return { success: false as const, error: "Notes cannot be empty" };
  }

  try {
    const response = await checkinService.addCoachNotes(
      responseId,
      notes,
      user.id
    );
    revalidatePath("/check-ins");
    revalidatePath(`/check-ins/${responseId}`);
    return { success: true as const, data: response };
  } catch (error) {
    console.error("Failed to add coach notes:", error);
    return { success: false as const, error: "Failed to save coach notes" };
  }
}

export async function markReviewedAction(responseId: string) {
  const user = await requireRole("TRAINER");

  try {
    const response = await checkinService.markResponseReviewed(
      responseId,
      user.id
    );
    revalidatePath("/check-ins");
    revalidatePath(`/check-ins/${responseId}`);
    return { success: true as const, data: response };
  } catch (error) {
    console.error("Failed to mark response reviewed:", error);
    return { success: false as const, error: "Failed to mark as reviewed" };
  }
}

// ─── Client actions ──────────────────────────────────────────────────────────

export async function submitCheckInResponseAction(
  assignmentId: string,
  answers: Record<string, unknown>
) {
  const user = await getCurrentUser();

  if (user.role !== "CLIENT") {
    return { success: false as const, error: "Unauthorized" };
  }

  if (!assignmentId) {
    return { success: false as const, error: "Assignment ID is required" };
  }

  if (!answers || Object.keys(answers).length === 0) {
    return { success: false as const, error: "Answers cannot be empty" };
  }

  try {
    // Fetched before the write, same reasoning as assignCheckInAction above:
    // a lookup failure here means the response was never submitted, so it's
    // safe to return an honest error rather than reporting failure for a
    // submission that actually went through.
    const assignment = await prisma.checkInAssignment.findUnique({
      where: { id: assignmentId },
      select: { trainerId: true, template: { select: { name: true } } },
    });

    const response = await checkinService.submitCheckInResponse(
      assignmentId,
      user.id,
      answers
    );
    revalidatePath("/check-ins");

    if (assignment) {
      const responseLink = `${appBaseUrl()}/check-ins/${response.id}`;
      await notifyUser({
        userId: assignment.trainerId,
        type: NOTIFICATION_TYPES.NEW_RESPONSE,
        title: "Check-in submitted",
        body: `${user.firstName} ${user.lastName} submitted "${assignment.template.name}".`,
        link: `/check-ins/${response.id}`,
        metadata: { responseId: response.id, assignmentId, clientId: user.id },
        email: {
          clientName: `${user.firstName} ${user.lastName}`,
          templateName: assignment.template.name,
          submittedAt: format(new Date(response.submittedAt), "MMMM d 'at' h:mm a"),
          responseLink,
        },
      });
    }

    return { success: true as const, data: response };
  } catch (error) {
    console.error("Failed to submit check-in response:", error);
    return {
      success: false as const,
      error: "Failed to submit check-in response",
    };
  }
}
