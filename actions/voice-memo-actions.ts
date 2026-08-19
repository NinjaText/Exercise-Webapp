"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import {
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { prisma } from "@/lib/prisma"
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { pusherServer } from "@/lib/pusher"
import { presignSchema, confirmSchema } from "@/lib/validators/voice-memo"

export type VoiceMemoData = {
  id: string
  workoutId: string
  authorId: string
  authorRole: "TRAINER" | "CLIENT"
  r2Key: string
  r2Url: string
  durationSec: number
  isRead: boolean
  createdAt: Date
}

export type FeedItem = {
  memoId: string
  clientClerkId: string
  clientName: string
  clientImageUrl: string | null
  workoutId: string
  workoutName: string
  sessionId: string
  isRead: boolean
  createdAt: Date
}

async function getAuthedUser() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function generateVoiceMemoPresignedUrl(
  workoutId: string,
  fileExtension: string
): Promise<{ success: boolean; data?: { presignedUrl: string; pendingKey: string }; error?: string }> {
  try {
    const parsed = presignSchema.safeParse({ workoutId, fileExtension })
    if (!parsed.success) return { success: false, error: "Invalid input" }

    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        program: { select: { id: true, trainerId: true, clientId: true } },
        sessions: { select: { clientId: true, status: true } },
      },
    })
    if (!workout) return { success: false, error: "Not found" }

    if (user.role === "TRAINER") {
      if (workout.program.trainerId !== user.id) return { success: false, error: "Forbidden" }
    } else {
      const completedSession = workout.sessions.find(
        (s) => s.clientId === user.id && s.status === "COMPLETED"
      )
      if (!completedSession) return { success: false, error: "Forbidden" }
    }

    const pendingKey = `voice-memos/pending/${randomUUID()}.${fileExtension}`
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: pendingKey,
      ContentType: `audio/${fileExtension}`,
    })
    const presignedUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 })

    return { success: true, data: { presignedUrl, pendingKey } }
  } catch (err) {
    console.error("[voice-memo] presign error:", err)
    return { success: false, error: "Failed to generate upload URL" }
  }
}

export async function confirmVoiceMemoUpload(
  workoutId: string,
  pendingKey: string,
  durationSec: number
): Promise<{ success: boolean; data?: VoiceMemoData; error?: string }> {
  try {
    const parsed = confirmSchema.safeParse({ workoutId, pendingKey, durationSec })
    if (!parsed.success) return { success: false, error: "Invalid input" }

    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        program: {
          include: {
            trainer: {
              select: { id: true, clerkId: true, email: true, firstName: true, lastName: true },
            },
            client: {
              select: { id: true, clerkId: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        sessions: { select: { id: true, clientId: true, status: true } },
      },
    })
    if (!workout) return { success: false, error: "Not found" }

    const authorRole: "TRAINER" | "CLIENT" = user.role === "TRAINER" ? "TRAINER" : "CLIENT"

    if (authorRole === "TRAINER" && workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" }
    }
    if (authorRole === "CLIENT") {
      const completedSession = workout.sessions.find(
        (s) => s.clientId === user.id && s.status === "COMPLETED"
      )
      if (!completedSession) return { success: false, error: "Forbidden" }
    }

    // Move object from pending/ to permanent key
    const roleKey = authorRole.toLowerCase()
    const ext = pendingKey.split(".").pop()!
    const permanentKey = `voice-memos/${workoutId}/${roleKey}_${randomUUID()}.${ext}`

    await getR2Client().send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET_NAME,
        CopySource: `${R2_BUCKET_NAME}/${pendingKey}`,
        Key: permanentKey,
      })
    )
    await getR2Client().send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: pendingKey })
    )

    // Replace any existing memo for this role on this workout (one-per-role limit)
    const existing = await prisma.voiceMemo.findFirst({
      where: { workoutId, authorRole },
    })
    if (existing) {
      await getR2Client()
        .send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: existing.r2Key }))
        .catch((e) => console.warn("[r2] delete old memo:", e))
      await prisma.voiceMemo.delete({ where: { id: existing.id } })
    }

    const r2Url = `${R2_PUBLIC_URL}/${permanentKey}`
    const memo = await prisma.voiceMemo.create({
      data: {
        workoutId,
        authorId: user.id,
        authorRole,
        r2Key: permanentKey,
        r2Url,
        durationSec,
        isRead: false,
      },
    })

    // Fire-and-forget in-app notifications via Pusher
    const workoutName = workout.name
    if (authorRole === "TRAINER" && workout.program.client) {
      const trainerName = `${workout.program.trainer?.firstName ?? ""} ${workout.program.trainer?.lastName ?? ""}`.trim()
      const clientClerkId = workout.program.client.clerkId
      pusherServer
        .trigger(`client-${clientClerkId}`, "voice-memo-added", { workoutId, workoutName, trainerName })
        .catch((e) => console.error("[pusher] voice-memo-added:", e))
    } else if (authorRole === "CLIENT" && workout.program.trainer) {
      const clientName = `${user.firstName} ${user.lastName}`
      const trainerClerkId = workout.program.trainer.clerkId
      pusherServer
        .trigger(`trainer-${trainerClerkId}`, "client-voice-memo-added", {
          clientClerkId: user.clerkId,
          clientName,
          workoutId,
          workoutName,
        })
        .catch((e) => console.error("[pusher] client-voice-memo-added:", e))
    }

    revalidatePath("/programs")
    revalidatePath("/sessions")

    return { success: true, data: memo as VoiceMemoData }
  } catch (err) {
    console.error("[voice-memo] confirm error:", err)
    return { success: false, error: "Failed to confirm upload" }
  }
}

export async function deleteVoiceMemo(
  memoId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const memo = await prisma.voiceMemo.findFirst({ where: { id: memoId, authorId: user.id } })
    if (!memo) return { success: false, error: "Not found" }

    await getR2Client()
      .send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: memo.r2Key }))
      .catch((e) => console.warn("[r2] delete memo:", e))

    await prisma.voiceMemo.delete({ where: { id: memoId } })
    return { success: true }
  } catch (err) {
    console.error("[voice-memo] delete error:", err)
    return { success: false, error: "Failed to delete" }
  }
}

export async function markVoiceMemoRead(
  memoId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const memo = await prisma.voiceMemo.findFirst({
      where: { id: memoId },
      include: { workout: { include: { program: { select: { trainerId: true, clientId: true } } } } },
    })
    if (!memo) return { success: false, error: "Not found" }

    // Only a genuine participant in this program (its trainer or its client) may
    // mark a memo as read, and never the memo's own author.
    const isParticipant =
      user.id === memo.workout.program.trainerId || user.id === memo.workout.program.clientId;
    if (!isParticipant || memo.authorId === user.id) {
      return { success: false, error: "Forbidden" }
    }

    await prisma.voiceMemo.update({ where: { id: memoId }, data: { isRead: true } })

    // Notify trainer in real-time that client has read the memo
    const trainer = await prisma.user.findUnique({
      where: { id: memo.workout.program.trainerId ?? "" },
      select: { clerkId: true },
    })
    if (trainer) {
      pusherServer
        .trigger(`trainer-${trainer.clerkId}`, "voice-memo-read", { memoId })
        .catch((e) => console.error("[pusher] voice-memo-read:", e))
    }

    return { success: true }
  } catch (err) {
    console.error("[voice-memo] markRead error:", err)
    return { success: false, error: "Failed to mark as read" }
  }
}

export async function getWorkoutVoiceMemos(workoutId: string): Promise<{
  success: boolean
  data?: { trainer: VoiceMemoData | null; client: VoiceMemoData | null }
  error?: string
}> {
  try {
    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { program: { select: { trainerId: true, clientId: true } } },
    })
    if (!workout) return { success: false, error: "Not found" }
    if (workout.program.trainerId !== user.id && workout.program.clientId !== user.id) {
      return { success: false, error: "Forbidden" }
    }

    const memos = await prisma.voiceMemo.findMany({
      where: { workoutId },
      orderBy: { createdAt: "desc" },
    })

    const trainer = (memos.find((m) => m.authorRole === "TRAINER") ?? null) as VoiceMemoData | null
    const client = (memos.find((m) => m.authorRole === "CLIENT") ?? null) as VoiceMemoData | null

    return { success: true, data: { trainer, client } }
  } catch (err) {
    console.error("[voice-memo] getWorkoutMemos error:", err)
    return { success: false, error: "Failed to fetch memos" }
  }
}

export async function getTrainerVoiceMessageFeed(): Promise<{
  success: boolean
  data?: FeedItem[]
  error?: string
}> {
  try {
    const user = await getAuthedUser()
    if (!user || user.role !== "TRAINER") return { success: false, error: "Unauthorized" }

    const programs = await prisma.program.findMany({
      where: { trainerId: user.id, clientId: { not: null } },
      include: {
        client: {
          select: { id: true, clerkId: true, firstName: true, lastName: true, imageUrl: true },
        },
        workouts: {
          include: {
            voiceMemos: {
              where: { authorRole: "CLIENT" },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            sessions: {
              where: { status: "COMPLETED" },
              orderBy: { completedAt: "desc" },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    })

    const feed: FeedItem[] = []
    for (const program of programs) {
      if (!program.client) continue
      const clientName = `${program.client.firstName} ${program.client.lastName}`
      for (const workout of program.workouts) {
        const memo = workout.voiceMemos[0]
        if (!memo) continue
        const session = workout.sessions[0]
        feed.push({
          memoId: memo.id,
          clientClerkId: program.client.clerkId,
          clientName,
          clientImageUrl: program.client.imageUrl ?? null,
          workoutId: workout.id,
          workoutName: workout.name,
          sessionId: session?.id ?? "",
          isRead: memo.isRead,
          createdAt: memo.createdAt,
        })
      }
    }

    feed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return { success: true, data: feed }
  } catch (err) {
    console.error("[voice-memo] feed error:", err)
    return { success: false, error: "Failed to fetch feed" }
  }
}
