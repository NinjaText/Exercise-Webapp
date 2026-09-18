"use server";

import { getCurrentUser } from "@/lib/current-user";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { getClientProgressReport } from "@/lib/services/client-progress.service";

export async function getClientProgressReportAction(
  clientId: string,
  from: string,
  to: string
) {
  const user = await getCurrentUser();
  if (user.role !== "TRAINER") {
    return { success: false as const, error: "Forbidden" };
  }

  // A trainer may only read progress for a client on their own roster. This is
  // the only thing stopping one trainer reading another's client data.
  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(clientId)) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const report = await getClientProgressReport(clientId, {
      from: new Date(from),
      to: new Date(to),
    });
    return { success: true as const, data: report };
  } catch {
    return { success: false as const, error: "Could not load progress" };
  }
}
