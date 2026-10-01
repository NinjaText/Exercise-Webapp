import { prisma } from "@/lib/prisma";

/**
 * Sliding-window limit on wrong access codes, backed by Mongo because
 * serverless instances share no memory. Key = "<ip>:<joinSlug>".
 */
export const JOIN_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 } as const;

export async function isJoinRateLimited(key: string, now = new Date()): Promise<boolean> {
  const count = await prisma.joinCodeAttempt.count({
    where: { key, createdAt: { gte: new Date(now.getTime() - JOIN_RATE_LIMIT.windowMs) } },
  });
  return count >= JOIN_RATE_LIMIT.max;
}

export async function recordFailedJoinAttempt(key: string): Promise<void> {
  await prisma.joinCodeAttempt.create({ data: { key } });
}
