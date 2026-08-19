"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import * as progressService from "@/lib/services/progress.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";

// ---------------------------------------------------------------------------
// Progress Photo Actions (client only)
// ---------------------------------------------------------------------------

export async function addProgressPhotoAction(
  imageUrl: string,
  angle?: string,
  notes?: string
) {
  const user = await getCurrentUser();
  if (user.role !== "CLIENT") {
    return { success: false as const, error: "Only clients can add progress photos" };
  }

  try {
    const photo = await progressService.addProgressPhoto(
      user.id,
      imageUrl,
      angle,
      notes
    );
    revalidatePath(`/clients/${user.id}/progress`);
    return { success: true as const, data: photo };
  } catch (error) {
    console.error("Failed to add progress photo:", error);
    return { success: false as const, error: "Failed to add progress photo" };
  }
}

export async function deleteProgressPhotoAction(photoId: string) {
  const user = await getCurrentUser();
  if (user.role !== "CLIENT") {
    return { success: false as const, error: "Only clients can delete their photos" };
  }

  try {
    await progressService.deleteProgressPhoto(photoId, user.id);
    revalidatePath(`/clients/${user.id}/progress`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete progress photo:", error);
    return { success: false as const, error: "Failed to delete progress photo" };
  }
}

// ---------------------------------------------------------------------------
// Body Metric Actions (client or trainer)
// ---------------------------------------------------------------------------

export async function addBodyMetricAction(
  clientId: string,
  metricType: string,
  value: number,
  unit: string,
  notes?: string
) {
  const user = await getCurrentUser();

  // Clients can only add metrics for themselves; trainers for their own roster
  if (user.role === "CLIENT" && user.id !== clientId) {
    return { success: false as const, error: "Forbidden" };
  }
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(clientId)) {
      return { success: false as const, error: "Forbidden" };
    }
  }

  try {
    const metric = await progressService.addBodyMetric(
      clientId,
      metricType,
      value,
      unit,
      notes
    );
    revalidatePath(`/clients/${clientId}/progress`);
    return { success: true as const, data: metric };
  } catch (error) {
    console.error("Failed to add body metric:", error);
    return { success: false as const, error: "Failed to add body metric" };
  }
}
