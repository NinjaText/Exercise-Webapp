import { prisma } from "@/lib/prisma";

export async function getClientsForTrainer(trainerId: string) {
  const trainer = await prisma.user.findUnique({
    where: { id: trainerId },
    select: { clerkOrgId: true },
  });
  if (!trainer?.clerkOrgId) return [];

  return prisma.user.findMany({
    where: { clerkOrgId: trainer.clerkOrgId, role: "CLIENT" },
    include: { clientProfile: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClientIdsForTrainer(trainerId: string): Promise<string[]> {
  const trainer = await prisma.user.findUnique({
    where: { id: trainerId },
    select: { clerkOrgId: true },
  });
  if (!trainer?.clerkOrgId) return [];

  const clients = await prisma.user.findMany({
    where: { clerkOrgId: trainer.clerkOrgId, role: "CLIENT" },
    select: { id: true },
  });
  return clients.map((p) => p.id);
}

/** Returns the trainer whose org the given client belongs to, if any. */
export async function getTrainerForClient(clientId: string) {
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { clerkOrgId: true },
  });
  if (!client?.clerkOrgId) return null;

  return prisma.user.findFirst({
    where: { clerkOrgId: client.clerkOrgId, role: "TRAINER" },
  });
}

export async function getClientDetail(clientId: string) {
  return prisma.user.findUnique({
    where: { id: clientId },
    include: {
      clientProfile: true,
      plansAsClient: {
        include: { _count: { select: { exercises: true, sessions: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

export async function getTrainersForClient(clientId: string) {
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { clerkOrgId: true },
  });
  if (!client?.clerkOrgId) return [];

  return prisma.user.findMany({
    where: { clerkOrgId: client.clerkOrgId, role: "TRAINER" },
  });
}
