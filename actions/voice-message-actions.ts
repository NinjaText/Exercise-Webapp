"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { prisma } from "@/lib/prisma"
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server"
import { MESSAGING_UNAVAILABLE } from "@/lib/org-capabilities"
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import * as messageService from "@/lib/services/message.service"
import { broadcastNewMessage } from "./message-actions"
import { presignVoiceMessageSchema, confirmVoiceMessageSchema } from "@/lib/validators/voice-message"

/** Voice notes live inside messaging; club orgs have none. */
async function messagingDisabled(user: { clerkOrgId: string | null }): Promise<boolean> {
  return !(await getCapabilitiesForUser(user)).messaging
}

async function getAuthedUser() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function generateVoiceMessageUploadUrl(
  recipientId: string,
  fileExtension: string
): Promise<{ success: boolean; data?: { presignedUrl: string; pendingKey: string }; error?: string }> {
  try {
    const parsed = presignVoiceMessageSchema.safeParse({ recipientId, fileExtension })
    if (!parsed.success) return { success: false, error: "Invalid input" }

    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }
    if (await messagingDisabled(user)) return { success: false, error: MESSAGING_UNAVAILABLE }

    const pendingKey = `voice-messages/pending/${randomUUID()}.${fileExtension}`
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: pendingKey,
      ContentType: `audio/${fileExtension}`,
    })
    const presignedUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 })

    return { success: true, data: { presignedUrl, pendingKey } }
  } catch (err) {
    console.error("[voice-message] presign error:", err)
    return { success: false, error: "Failed to generate upload URL" }
  }
}

export async function confirmVoiceMessage(
  recipientId: string,
  pendingKey: string,
  durationSec: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = confirmVoiceMessageSchema.safeParse({ recipientId, pendingKey, durationSec })
    if (!parsed.success) return { success: false, error: "Invalid input" }

    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }
    if (await messagingDisabled(user)) return { success: false, error: MESSAGING_UNAVAILABLE }

    const ext = pendingKey.split(".").pop()!
    const permanentKey = `voice-messages/${user.id}_${recipientId}/${randomUUID()}.${ext}`

    await getR2Client().send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET_NAME,
        CopySource: `${R2_BUCKET_NAME}/${pendingKey}`,
        Key: permanentKey,
      })
    )
    await getR2Client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: pendingKey }))

    const r2Url = `${R2_PUBLIC_URL}/${permanentKey}`
    const message = await messageService.sendVoiceMessage({
      senderId: user.id,
      recipientId,
      audioUrl: r2Url,
      audioDurationSec: durationSec,
    })

    broadcastNewMessage(message)
    revalidatePath("/messages")

    return { success: true }
  } catch (err) {
    console.error("[voice-message] confirm error:", err)
    return { success: false, error: "Failed to send voice message" }
  }
}
