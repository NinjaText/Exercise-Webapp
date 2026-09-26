"use server";

import { getCurrentUser } from "@/lib/current-user";
import {
  registerDevice,
  unregisterToken,
  isValidPushToken,
  type PushPlatformInput,
} from "@/lib/services/push-device.service";

/**
 * Error name and code only: the raw error (e.g. a Prisma error) can quote the
 * query, including the device token.
 */
function errorSummary(err: unknown): { name: string; code?: string } {
  if (!(err instanceof Error)) return { name: "unknown" };
  const code = (err as { code?: unknown }).code;
  return { name: err.name, ...(typeof code === "string" ? { code } : {}) };
}

function isPushPlatform(value: string): value is PushPlatformInput {
  return value === "ios" || value === "android";
}

/**
 * Registers the signed-in user's device for push delivery.
 *
 * This runs on app foreground, so any failure — no session, a malformed
 * token, an unrecognised platform — fails soft with `{ success: false }`
 * rather than throwing, which would surface as an error the user cannot act
 * on.
 */
export async function registerPushDeviceAction(input: {
  token: string;
  platform: string;
  appVersion?: string | null;
}): Promise<{ success: boolean }> {
  try {
    const user = await getCurrentUser();
    if (!isValidPushToken(input.token) || !isPushPlatform(input.platform)) {
      return { success: false };
    }

    await registerDevice({
      userId: user.id,
      token: input.token,
      platform: input.platform,
      appVersion: input.appVersion ?? null,
    });
    return { success: true };
  } catch (err) {
    console.error("[push] Failed to register push device", errorSummary(err));
    return { success: false };
  }
}

/** Forgets a device token for the signed-in user (e.g. "sign out of this device"). */
export async function unregisterPushDeviceAction(input: {
  token: string;
}): Promise<{ success: boolean }> {
  try {
    const user = await getCurrentUser();
    await unregisterToken(input.token, user.id);
    return { success: true };
  } catch (err) {
    console.error("[push] Failed to unregister push device", errorSummary(err));
    return { success: false };
  }
}
