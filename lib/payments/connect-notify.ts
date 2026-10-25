import { prisma } from "@/lib/prisma";
import { notifyUser, type NotifyUserInput } from "@/lib/services/notification.service";

/**
 * Stripe redelivers webhooks, so a notification tied to one Stripe object
 * (an invoice, a checkout) must be sent at most once. Prisma can't filter
 * Mongo JSON, so this reads the user's recent notifications of the same type
 * and compares `metadata.dedupeKey` in memory — a small, indexed read.
 * Never throws (same contract as notifyUser).
 */
const DEDUPE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

export async function notifyOnce(input: NotifyUserInput, dedupeKey: string): Promise<void> {
  try {
    const recent = await prisma.notification.findMany({
      where: { userId: input.userId, type: input.type, createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) } },
      select: { metadata: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const seen = recent.some((n) => {
      const meta = n.metadata as { dedupeKey?: unknown } | null;
      return meta?.dedupeKey === dedupeKey;
    });
    if (seen) return;
    const metadata = (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {}) as Record<string, unknown>;
    await notifyUser({ ...input, metadata: { ...metadata, dedupeKey } as NotifyUserInput["metadata"] });
  } catch (err) {
    console.error(`[payments] notifyOnce failed for ${input.type} (${dedupeKey}):`, err);
  }
}
