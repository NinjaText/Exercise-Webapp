"use server";

import { activeCallerOnly } from "@/lib/auth/active-user";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { revalidatePath } from "next/cache";
import { INSIGHT_KINDS } from "@/lib/constants/insights";
import { ALERT_KINDS, PRIORITY_DISMISS_PREFIX } from "@/lib/services/dashboard-insights.service";

const dismissInsightSchema = z.object({
  clientId: z.string().min(1, "A client is required"),
  kind: z.enum(INSIGHT_KINDS),
});

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await activeCallerOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

/**
 * Suppresses one dashboard AI insight for this trainer.
 *
 * Keyed by (trainer, client, kind) rather than by an insight id — insights are
 * regenerated from scratch on every dashboard load and have no stable id, so
 * the pairing is the only thing that survives a regeneration. The row is
 * upserted so re-dismissing simply refreshes the suppression window.
 */
export async function dismissInsightAction(input: { clientId: string; kind: string }) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const parsed = dismissInsightSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(parsed.data.clientId)) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await prisma.dismissedInsight.upsert({
      where: {
        trainerId_clientId_kind: {
          trainerId: user.id,
          clientId: parsed.data.clientId,
          kind: parsed.data.kind,
        },
      },
      update: { dismissedAt: new Date() },
      create: {
        trainerId: user.id,
        clientId: parsed.data.clientId,
        kind: parsed.data.kind,
      },
    });
    return { success: true as const };
  } catch (error) {
    console.error("Failed to dismiss insight:", error);
    return { success: false as const, error: "Failed to dismiss insight" };
  }
}

const dismissPrioritiesSchema = z
  .array(
    z.object({
      clientId: z.string().min(1, "A client is required"),
      kind: z.enum(ALERT_KINDS),
    })
  )
  .min(1)
  .max(50);

/**
 * Clears one or more "Today's Priorities" alerts for this trainer.
 *
 * Stored alongside AI-insight dismissals, namespaced by PRIORITY_DISMISS_PREFIX.
 * Unlike AI insights there's no fixed window: getDashboardInsights hides a
 * cleared alert only until its evidence changes (new feedback, another missed
 * workout…), so re-dismissing just moves the cut-off forward.
 */
export async function dismissPrioritiesAction(items: { clientId: string; kind: string }[]) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const parsed = dismissPrioritiesSchema.safeParse(items);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const clientIds = new Set(await getClientIdsForTrainer(user.id));
  if (parsed.data.some((item) => !clientIds.has(item.clientId))) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const dismissedAt = new Date();
    await Promise.all(
      parsed.data.map((item) => {
        const kind = `${PRIORITY_DISMISS_PREFIX}${item.kind}`;
        return prisma.dismissedInsight.upsert({
          where: { trainerId_clientId_kind: { trainerId: user.id, clientId: item.clientId, kind } },
          update: { dismissedAt },
          create: { trainerId: user.id, clientId: item.clientId, kind, dismissedAt },
        });
      })
    );
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to dismiss priorities:", error);
    return { success: false as const, error: "Failed to clear priorities" };
  }
}
