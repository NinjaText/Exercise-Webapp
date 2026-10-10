"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/current-user";
import { ensureClubAlertSubscriber, setClubAlertsMuted } from "@/lib/services/club-alerts.service";

type Result = { ok: true } | { ok: false; error: string };

export async function setClubAlertsMutedAction(muted: boolean): Promise<Result> {
  const admin = await requireSuperAdmin();
  try {
    await ensureClubAlertSubscriber(admin);
    await setClubAlertsMuted(admin.id, muted);
    revalidatePath("/admin/clubs");
    return { ok: true };
  } catch (err) {
    console.error("setClubAlertsMutedAction failed:", err);
    return { ok: false, error: "Could not update your alert setting." };
  }
}
