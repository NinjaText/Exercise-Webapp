import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Core of the one-shot club null-field backfill. Prisma on MongoDB matches
 * `{ field: null }` only when the field is present, so MemberSubscription /
 * MemberCoaching docs created before creates wrote explicit nulls are
 * invisible to those filters. This writes an explicit null into every such
 * optional field that is missing. Idempotent: only `isSet: false` docs are
 * touched, and a set value is never overwritten. The prisma client is
 * injected for testing; the entry point is ./backfill-club-null-fields.ts.
 */

export const MEMBER_SUBSCRIPTION_NULL_FIELDS = [
  "stripeCustomerId",
  "stripeSubscriptionId",
  "currentPeriodEnd",
] as const;

export const MEMBER_COACHING_NULL_FIELDS = [
  "requestNote",
  "responseNote",
  "respondedAt",
  "respondedById",
  "stripeSubscriptionId",
  "currentPeriodEnd",
] as const;

export type BackfillRow = {
  collection: "MemberSubscription" | "MemberCoaching";
  field: string;
  missing: number;
  updated: number;
};

type Db = Pick<PrismaClient, "memberSubscription" | "memberCoaching">;

export async function backfillClubNullFields({ prisma, apply }: { prisma: Db; apply: boolean }): Promise<BackfillRow[]> {
  const rows: BackfillRow[] = [];

  for (const field of MEMBER_SUBSCRIPTION_NULL_FIELDS) {
    const where = { [field]: { isSet: false } } as Prisma.MemberSubscriptionWhereInput;
    const missing = await prisma.memberSubscription.count({ where });
    let updated = 0;
    if (apply && missing > 0) {
      const data = { [field]: null } as Prisma.MemberSubscriptionUpdateManyMutationInput;
      ({ count: updated } = await prisma.memberSubscription.updateMany({ where, data }));
    }
    rows.push({ collection: "MemberSubscription", field, missing, updated });
  }

  for (const field of MEMBER_COACHING_NULL_FIELDS) {
    const where = { [field]: { isSet: false } } as Prisma.MemberCoachingWhereInput;
    const missing = await prisma.memberCoaching.count({ where });
    let updated = 0;
    if (apply && missing > 0) {
      const data = { [field]: null } as Prisma.MemberCoachingUpdateManyMutationInput;
      ({ count: updated } = await prisma.memberCoaching.updateMany({ where, data }));
    }
    rows.push({ collection: "MemberCoaching", field, missing, updated });
  }

  return rows;
}
