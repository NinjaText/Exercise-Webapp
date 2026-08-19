import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ─── Frequency helpers ───────────────────────────────────────────────────────

function getFrequencyDays(frequency: string): number {
  switch (frequency) {
    case "BIWEEKLY":
      return 14;
    case "MONTHLY":
      return 30;
    case "WEEKLY":
    default:
      return 7;
  }
}

function computeNextDueDate(startDate: Date, frequency: string): Date {
  const next = new Date(startDate);
  next.setDate(next.getDate() + getFrequencyDays(frequency));
  return next;
}

// ─── Template queries ────────────────────────────────────────────────────────

export async function getTemplatesForTrainer(trainerId: string) {
  const templates = await prisma.checkInTemplate.findMany({
    where: { trainerId },
    include: {
      _count: { select: { questions: true, assignments: true } },
      assignments: {
        include: {
          _count: { select: { responses: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return templates.map((t) => {
    const responseCount = t.assignments.reduce(
      (sum, a) => sum + a._count.responses,
      0
    );
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      frequency: t.frequency,
      isActive: t.isActive,
      createdAt: t.createdAt,
      questionCount: t._count.questions,
      assignmentCount: t._count.assignments,
      responseCount,
    };
  });
}

export async function getTemplateById(id: string) {
  return prisma.checkInTemplate.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { orderIndex: "asc" } },
    },
  });
}

// ─── Template mutations ──────────────────────────────────────────────────────

export interface CreateTemplateInput {
  name: string;
  description?: string;
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  questions: {
    questionText: string;
    questionType: "TEXT" | "SCALE" | "BOOLEAN" | "MULTIPLE_CHOICE";
    options?: string[];
    isRequired: boolean;
    orderIndex: number;
  }[];
}

export async function createTemplate(
  trainerId: string,
  data: CreateTemplateInput
) {
  return prisma.checkInTemplate.create({
    data: {
      trainerId,
      name: data.name,
      description: data.description,
      frequency: data.frequency,
      questions: {
        create: data.questions.map((q) => ({
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options ?? [],
          isRequired: q.isRequired,
          orderIndex: q.orderIndex,
        })),
      },
    },
    include: { questions: true },
  });
}

// ─── Assignment ──────────────────────────────────────────────────────────────

export async function assignTemplateToClient(
  templateId: string,
  clientId: string,
  trainerId: string
) {
  const template = await prisma.checkInTemplate.findUnique({
    where: { id: templateId },
    select: { frequency: true, trainerId: true },
  });

  if (!template) throw new Error("Template not found");
  if (template.trainerId !== trainerId) throw new Error("Unauthorized");

  const startDate = new Date();
  const nextDueDate = computeNextDueDate(startDate, template.frequency);

  // Deactivate any existing assignment for the same template + client
  await prisma.checkInAssignment.updateMany({
    where: { templateId, clientId, isActive: true },
    data: { isActive: false },
  });

  return prisma.checkInAssignment.create({
    data: {
      templateId,
      clientId,
      trainerId,
      startDate,
      nextDueDate,
      isActive: true,
    },
  });
}

// ─── Client check-in queries ────────────────────────────────────────────────

export async function getPendingCheckInsForClient(clientId: string) {
  // Due = nextDueDate <= now + 1 day (give a 24h window)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 1);

  return prisma.checkInAssignment.findMany({
    where: {
      clientId,
      isActive: true,
      nextDueDate: { lte: cutoff },
    },
    include: {
      template: {
        select: { id: true, name: true, frequency: true, description: true },
      },
    },
    orderBy: { nextDueDate: "asc" },
  });
}

export async function getCheckInAssignmentsForClient(clientId: string) {
  return prisma.checkInAssignment.findMany({
    where: { clientId, isActive: true },
    include: {
      template: {
        select: { id: true, name: true, frequency: true },
      },
      responses: {
        select: { id: true, submittedAt: true },
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { nextDueDate: "asc" },
  });
}

// ─── Response submission ─────────────────────────────────────────────────────

export async function submitCheckInResponse(
  assignmentId: string,
  clientId: string,
  answers: Record<string, unknown>
) {
  const assignment = await prisma.checkInAssignment.findUnique({
    where: { id: assignmentId },
    include: { template: { select: { frequency: true } } },
  });

  if (!assignment) throw new Error("Assignment not found");
  if (assignment.clientId !== clientId) throw new Error("Forbidden");

  const [response] = await Promise.all([
    prisma.checkInResponse.create({
      data: {
        assignmentId,
        clientId,
        answers: answers as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
    }),
    prisma.checkInAssignment.update({
      where: { id: assignmentId },
      data: {
        nextDueDate: computeNextDueDate(
          new Date(),
          assignment.template.frequency
        ),
      },
    }),
  ]);

  return response;
}

// ─── Trainer review queries ────────────────────────────────────────────────

export async function getResponsesForTrainer(
  trainerId: string,
  clientId?: string
) {
  return prisma.checkInResponse.findMany({
    where: {
      assignment: {
        trainerId,
        ...(clientId && { clientId }),
      },
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      assignment: {
        include: {
          template: { select: { id: true, name: true, frequency: true } },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });
}

export async function getResponseById(responseId: string) {
  return prisma.checkInResponse.findUnique({
    where: { id: responseId },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      assignment: {
        include: {
          template: {
            include: { questions: { orderBy: { orderIndex: "asc" } } },
          },
        },
      },
    },
  });
}

export async function addCoachNotes(
  responseId: string,
  coachNotes: string,
  trainerId: string
) {
  // Verify ownership via the assignment trainerId
  const response = await prisma.checkInResponse.findUnique({
    where: { id: responseId },
    include: { assignment: { select: { trainerId: true } } },
  });

  if (!response) throw new Error("Response not found");
  if (response.assignment.trainerId !== trainerId)
    throw new Error("Forbidden");

  return prisma.checkInResponse.update({
    where: { id: responseId },
    data: {
      coachNotes,
      isReviewed: true,
      reviewedAt: new Date(),
    },
  });
}

export async function markResponseReviewed(
  responseId: string,
  trainerId: string
) {
  const response = await prisma.checkInResponse.findUnique({
    where: { id: responseId },
    include: { assignment: { select: { trainerId: true } } },
  });

  if (!response) throw new Error("Response not found");
  if (response.assignment.trainerId !== trainerId)
    throw new Error("Forbidden");

  return prisma.checkInResponse.update({
    where: { id: responseId },
    data: { isReviewed: true, reviewedAt: new Date() },
  });
}

export async function getUnreviewedCount(trainerId: string): Promise<number> {
  return prisma.checkInResponse.count({
    where: {
      assignment: { trainerId },
      isReviewed: false,
    },
  });
}
