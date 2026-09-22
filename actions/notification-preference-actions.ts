"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import {
  readPreference,
  updatePreference,
  type PreferencePatch,
  type PreferenceValues,
} from "@/lib/services/notification-preference.service";

const EDITABLE_KEYS = ["emailEnabled", "sessions", "messages", "nutrition"] as const;

/**
 * Either the user's values, or an explicit failure.
 *
 * Deliberately not the dispatcher's fail-closed all-false value: that is
 * indistinguishable from a real opt-out, and the form posts every key on save,
 * so one click after a read blip would write the mute permanently.
 */
export type PreferenceReadResult =
  | { ok: true; values: PreferenceValues }
  | { ok: false; error: string };

export async function getMyPreferenceAction(): Promise<PreferenceReadResult> {
  const user = await getCurrentUser();
  try {
    return { ok: true, values: await readPreference(user.id) };
  } catch (err) {
    console.error("Failed to load notification preferences:", err);
    return { ok: false, error: "Failed to load notification preferences" };
  }
}

/**
 * Saves the signed-in user's preferences.
 *
 * The patch arrives from the client, so it is filtered to the four editable
 * boolean keys. `userId` cannot be spoofed and `billing` cannot be set.
 */
export async function updateMyPreferenceAction(
  patch: PreferencePatch
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await getCurrentUser();

    const clean: PreferencePatch = {};
    for (const key of EDITABLE_KEYS) {
      if (typeof patch?.[key] === "boolean") clean[key] = patch[key];
    }

    await updatePreference(user.id, clean);
    revalidatePath("/settings/notifications");
    return { success: true };
  } catch (err) {
    console.error("Failed to save notification preferences:", err);
    return { success: false, error: "Failed to save notification preferences" };
  }
}
