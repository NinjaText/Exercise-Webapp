import { prisma } from "@/lib/prisma";
import type { BodyRegion } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";

export async function getPlatformStats() {
  const [
    totalUsers,
    trainers,
    clients,
    totalExercises,
    totalPrograms,
    totalSessions,
    activePrograms,
    newUsersThisMonth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "TRAINER" } }),
    prisma.user.count({ where: { role: "CLIENT" } }),
    prisma.exercise.count(),
    prisma.program.count(),
    prisma.workoutSessionV2.count({ where: { status: "COMPLETED" } }),
    prisma.program.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({
      where: {
        createdAt: { gte: startOfMonth(new Date()) },
      },
    }),
  ]);

  return {
    totalUsers,
    trainers,
    clients,
    totalExercises,
    totalPrograms,
    totalSessions,
    activePrograms,
    newUsersThisMonth,
  };
}

export async function listClerkOrganizations() {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationList({ limit: 100 });
  return data.map((org) => ({ id: org.id, name: org.name }));
}

export async function getUserGrowthData(months = 6) {
  const now = new Date();
  const monthRanges = Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMM yyyy") };
  });

  const counts = await Promise.all(
    monthRanges.map(({ start, end }) =>
      prisma.user.count({ where: { createdAt: { gte: start, lte: end } } })
    )
  );

  return monthRanges.map((m, i) => ({ month: m.label, users: counts[i] }));
}

export async function getProgramCreationData(months = 6) {
  const now = new Date();
  const monthRanges = Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMM yyyy") };
  });

  const counts = await Promise.all(
    monthRanges.map(({ start, end }) =>
      prisma.program.count({ where: { createdAt: { gte: start, lte: end } } })
    )
  );

  return monthRanges.map((m, i) => ({ month: m.label, programs: counts[i] }));
}

export async function getSessionActivityData(months = 6) {
  const now = new Date();
  const monthRanges = Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMM yyyy") };
  });

  const counts = await Promise.all(
    monthRanges.map(({ start, end }) =>
      prisma.workoutSessionV2.count({
        where: { status: "COMPLETED", createdAt: { gte: start, lte: end } },
      })
    )
  );

  return monthRanges.map((m, i) => ({ month: m.label, sessions: counts[i] }));
}

export async function getRecentUsers(limit = 10) {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      onboarded: true,
      imageUrl: true,
      createdAt: true,
    },
  });
}

export async function getTopTrainers(limit = 5) {
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      imageUrl: true,
      clerkOrgId: true,
      programsCreated: { select: { id: true } },
    },
    take: 20,
  });

  const withCounts = await Promise.all(
    trainers.map(async (c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      imageUrl: c.imageUrl,
      clientCount: c.clerkOrgId
        ? await prisma.user.count({
            where: { clerkOrgId: c.clerkOrgId, role: "CLIENT" },
          })
        : 0,
      programCount: c.programsCreated.length,
    }))
  );

  return withCounts
    .sort((a, b) => b.clientCount - a.clientCount)
    .slice(0, limit);
}

export async function getAllUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "TRAINER" | "CLIENT" | "ALL";
  archivedOnly?: boolean;
  orgId?: string;
}) {
  const { page = 1, pageSize = 20, search, role = "ALL", archivedOnly = false, orgId } = params;

  const where = {
    isActive: archivedOnly ? false : { not: false },
    ...(role !== "ALL" && { role }),
    ...(orgId && { clerkOrgId: orgId }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" as const } },
        { lastName: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [rawItems, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        onboarded: true,
        isActive: true,
        imageUrl: true,
        createdAt: true,
        clerkOrgId: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  // Build org name map: clerkOrgId → trainer full name
  const orgIds = [...new Set(rawItems.map(u => u.clerkOrgId).filter(Boolean))] as string[];
  const orgNameMap: Record<string, string> = {};
  if (orgIds.length > 0) {
    const trainers = await prisma.user.findMany({
      where: { clerkOrgId: { in: orgIds }, role: "TRAINER" },
      select: { clerkOrgId: true, firstName: true, lastName: true },
    });
    for (const t of trainers) {
      if (t.clerkOrgId) orgNameMap[t.clerkOrgId] = `${t.firstName} ${t.lastName}`;
    }
  }

  // Compute connection counts per user based on their organization.
  // Trainers: number of clients in the org. Clients: number of trainers in the org.
  const items = await Promise.all(
    rawItems.map(async (u) => {
      let connectionCount = 0;
      if (u.clerkOrgId) {
        connectionCount = await prisma.user.count({
          where: {
            clerkOrgId: u.clerkOrgId,
            role: u.role === "TRAINER" ? "CLIENT" : "TRAINER",
          },
        });
      }
      const orgName = u.clerkOrgId ? (orgNameMap[u.clerkOrgId] ?? null) : null;
      return { ...u, connectionCount, orgName };
    })
  );

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getTrainersForOrgFilter() {
  return prisma.user.findMany({
    where: { role: "TRAINER", clerkOrgId: { not: null } },
    select: { clerkOrgId: true, firstName: true, lastName: true },
    orderBy: { firstName: "asc" },
  });
}

export async function getAllExercises(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  bodyRegions?: string[];
  isAssessment?: boolean;
}) {
  const { page = 1, pageSize = 25, search, bodyRegions, isAssessment = false } = params;

  const where = {
    isActive: { not: false },
    isAssessment,
    ...(bodyRegions?.length && { bodyRegion: { hasSome: bodyRegions as BodyRegion[] } }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.exercise.findMany({
      where,
      include: {
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exercise.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAllPrograms(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}) {
  const { page = 1, pageSize = 25, search, status } = params;

  const where = {
    ...(status && status !== "ALL" && { status: status as never }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.program.findMany({
      where,
      include: {
        trainer: { select: { firstName: true, lastName: true, email: true } },
        client: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.program.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAdminGlobalPrograms(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  const search = params.search ?? "";

  const where = {
    isGlobal: true,
    status: { not: "ARCHIVED" as const },
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [items, total] = await Promise.all([
    prisma.program.findMany({
      where,
      include: {
        _count: { select: { workouts: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.program.count({ where }),
  ]);

  return { items, total, totalPages: Math.ceil(total / pageSize) };
}

export interface TrainerWithClients {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl: string | null;
  clerkOrgId: string | null;
  onboarded: boolean;
  isActive: boolean;
  createdAt: Date;
  clients: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    imageUrl: string | null;
    onboarded: boolean;
    isActive: boolean;
    createdAt: Date;
  }>;
}

export async function getTrainersWithClients(): Promise<TrainerWithClients[]> {
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      imageUrl: true,
      clerkOrgId: true,
      onboarded: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    trainers.map(async (trainer) => {
      const clients = trainer.clerkOrgId
        ? await prisma.user.findMany({
            where: { clerkOrgId: trainer.clerkOrgId, role: "CLIENT" },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              imageUrl: true,
              onboarded: true,
              isActive: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : [];
      return { ...trainer, clients };
    })
  );
}
