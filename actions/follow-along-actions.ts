"use server";

import { randomUUID } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { activeCallerOnly } from "@/lib/auth/active-user";
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2";
import {
  followAlongVideoPresignSchema,
  FOLLOW_ALONG_VIDEO_EXTENSIONS,
  type FollowAlongVideoPresignInput,
} from "@/lib/validators/follow-along";

// A 2 GB upload can take a while, but the URL only has to be valid when the
// PUT starts — R2 doesn't cut off a transfer that began before expiry.
const PRESIGN_EXPIRY_SECONDS = 15 * 60;

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

/**
 * Presigned R2 PUT for a follow-along video. Trainer-only; the key is scoped
 * to the trainer (`follow-along/{trainerId}/{uuid}.{ext}`) and the declared
 * size is bound into the signature as Content-Length, so the browser must
 * upload exactly that many bytes.
 */
export async function generateFollowAlongVideoUploadUrlAction(input: FollowAlongVideoPresignInput): Promise<{
  success: boolean;
  data?: { presignedUrl: string; fileUrl: string; contentType: string };
  error?: string;
}> {
  const user = await getTrainerUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const parsed = followAlongVideoPresignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  try {
    const { contentType, fileSize } = parsed.data;
    const key = `follow-along/${user.id}/${randomUUID()}.${FOLLOW_ALONG_VIDEO_EXTENSIONS[contentType]}`;
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ContentLength: fileSize,
    });
    // Sign content-length/type explicitly so the size cap is enforced by R2
    // rather than relying on the presigner's default header hoisting.
    const presignedUrl = await getSignedUrl(getR2Client(), command, {
      expiresIn: PRESIGN_EXPIRY_SECONDS,
      signableHeaders: new Set(["content-length", "content-type"]),
    });

    return { success: true, data: { presignedUrl, fileUrl: `${R2_PUBLIC_URL}/${key}`, contentType } };
  } catch (error) {
    console.error("[follow-along] presign error:", error);
    return { success: false, error: "Failed to generate upload URL" };
  }
}
