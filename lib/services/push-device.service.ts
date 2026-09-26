import { prisma } from "@/lib/prisma";
import { PushPlatform } from "@prisma/client";

export type PushPlatformInput = "ios" | "android";

function toPlatform(input: PushPlatformInput): PushPlatform {
  return input === "ios" ? PushPlatform.IOS : PushPlatform.ANDROID;
}

/**
 * Registers (or re-registers) a device token for push delivery.
 *
 * Upserts by `token`, not by (userId, token): a token is unique to a device
 * install, and Apple/Google can reassign the same token to a different
 * install (reinstall, account switch on a shared device). Upserting by token
 * alone means such a token is simply reassigned to its new owner rather than
 * left duplicated under the old one.
 */
export async function registerDevice(input: {
  userId: string;
  token: string;
  platform: PushPlatformInput;
  appVersion?: string | null;
}): Promise<void> {
  const platform = toPlatform(input.platform);
  const appVersion = input.appVersion ?? null;

  await prisma.pushDevice.upsert({
    where: { token: input.token },
    update: {
      userId: input.userId,
      platform,
      appVersion,
      lastSeenAt: new Date(),
    },
    create: {
      userId: input.userId,
      token: input.token,
      platform,
      appVersion,
    },
  });
}

/**
 * Removes a device token. Scoped to `userId` when given (the authenticated
 * "forget this device" path); unscoped for the sign-out path, where
 * possessing the token is itself proof of the device and there is no
 * session left to scope by.
 */
export async function unregisterToken(token: string, userId?: string): Promise<void> {
  await prisma.pushDevice.deleteMany({
    where: userId ? { token, userId } : { token },
  });
}

export async function listDevices(
  userId: string
): Promise<{ token: string; platform: "IOS" | "ANDROID" }[]> {
  const rows = await prisma.pushDevice.findMany({
    where: { userId },
    select: { token: true, platform: true },
  });
  return rows;
}

/** Bulk-removes tokens, e.g. ones a push provider reported as no longer valid. */
export async function removeTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await prisma.pushDevice.deleteMany({ where: { token: { in: tokens } } });
}

const PUSH_TOKEN_PATTERN = /^[A-Za-z0-9:_\-.]+$/;

export function isValidPushToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length > 0 &&
    token.length <= 4096 &&
    PUSH_TOKEN_PATTERN.test(token)
  );
}
