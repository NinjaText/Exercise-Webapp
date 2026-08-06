"use server"

import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"

export type SearchResults = {
  clients: { id: string; firstName: string; lastName: string; email: string }[]
  programs: { id: string; name: string; status: string }[]
  exercises: { id: string; name: string; bodyRegion: string[] | null; difficultyLevel: string }[]
}

export async function globalSearch(query: string): Promise<SearchResults> {
  if (!query || query.trim().length === 0) {
    return { clients: [], programs: [], exercises: [] }
  }

  const [user, { orgId }] = await Promise.all([getCurrentUser(), auth()])
  const q = query.trim()
  const clerkOrgId = orgId ?? user.clerkOrgId ?? undefined

  const [clients, programs, exercises] = await Promise.all([
    user.role === "TRAINER" && clerkOrgId
      ? prisma.user.findMany({
          where: {
            clerkOrgId,
            role: "CLIENT",
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, firstName: true, lastName: true, email: true },
          take: 5,
        })
      : Promise.resolve([]),

    user.role === "TRAINER"
      ? prisma.program.findMany({
          where: {
            trainerId: user.id,
            name: { contains: q, mode: "insensitive" },
          },
          select: { id: true, name: true, status: true },
          take: 5,
        })
      : prisma.program.findMany({
          where: {
            clientId: user.id,
            name: { contains: q, mode: "insensitive" },
          },
          select: { id: true, name: true, status: true },
          take: 5,
        }),

    prisma.exercise.findMany({
      where: {
        name: { contains: q, mode: "insensitive" },
        OR: [
          { source: "UNIVERSAL" },
          ...(clerkOrgId ? [{ source: "ORGANIZATION" as const, organizationId: clerkOrgId }] : []),
        ],
      },
      select: { id: true, name: true, bodyRegion: true, difficultyLevel: true },
      take: 5,
    }),
  ])

  return { clients, programs, exercises }
}
