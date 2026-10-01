import { describe, it, expect, vi } from "vitest";
import {
  backfillClubNullFields,
  MEMBER_COACHING_NULL_FIELDS,
  MEMBER_SUBSCRIPTION_NULL_FIELDS,
} from "../club-null-fields";

/** Missing-doc counts per field; updateMany reports the same count it was asked to fix. */
function fakePrisma(missing: Record<string, number>) {
  const model = (name: string) => ({
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => missing[`${name}.${Object.keys(where)[0]}`] ?? 0),
    updateMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => ({
      count: missing[`${name}.${Object.keys(where)[0]}`] ?? 0,
    })),
  });
  return { memberSubscription: model("MemberSubscription"), memberCoaching: model("MemberCoaching") };
}

const MISSING = {
  "MemberSubscription.stripeSubscriptionId": 4,
  "MemberSubscription.stripeCustomerId": 3,
  "MemberCoaching.respondedAt": 2,
};

describe("backfillClubNullFields", () => {
  it("dry run counts unset docs per field and writes nothing", async () => {
    const db = fakePrisma(MISSING);
    const rows = await backfillClubNullFields({ prisma: db as any, apply: false });

    expect(db.memberSubscription.updateMany).not.toHaveBeenCalled();
    expect(db.memberCoaching.updateMany).not.toHaveBeenCalled();
    expect(db.memberSubscription.count).toHaveBeenCalledWith({ where: { stripeSubscriptionId: { isSet: false } } });
    expect(rows).toHaveLength(MEMBER_SUBSCRIPTION_NULL_FIELDS.length + MEMBER_COACHING_NULL_FIELDS.length);
    expect(rows).toContainEqual({ collection: "MemberSubscription", field: "stripeSubscriptionId", missing: 4, updated: 0 });
    expect(rows).toContainEqual({ collection: "MemberCoaching", field: "respondedAt", missing: 2, updated: 0 });
  });

  it("apply sets an explicit null only on unset docs, and skips fields with nothing missing", async () => {
    const db = fakePrisma(MISSING);
    const rows = await backfillClubNullFields({ prisma: db as any, apply: true });

    expect(db.memberSubscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: { isSet: false } },
      data: { stripeSubscriptionId: null },
    });
    expect(db.memberSubscription.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: { isSet: false } },
      data: { stripeCustomerId: null },
    });
    expect(db.memberCoaching.updateMany).toHaveBeenCalledWith({
      where: { respondedAt: { isSet: false } },
      data: { respondedAt: null },
    });
    // currentPeriodEnd had 0 missing on MemberSubscription → no write.
    expect(db.memberSubscription.updateMany).toHaveBeenCalledTimes(2);
    expect(db.memberCoaching.updateMany).toHaveBeenCalledTimes(1);
    expect(rows).toContainEqual({ collection: "MemberSubscription", field: "stripeSubscriptionId", missing: 4, updated: 4 });
  });

  it("covers every optional field the club queries filter on", () => {
    expect(MEMBER_SUBSCRIPTION_NULL_FIELDS).toEqual(["stripeCustomerId", "stripeSubscriptionId", "currentPeriodEnd"]);
    expect(MEMBER_COACHING_NULL_FIELDS).toEqual(
      expect.arrayContaining(["stripeSubscriptionId", "currentPeriodEnd", "respondedAt", "respondedById", "responseNote", "requestNote"])
    );
  });
});
