import { describe, it, expect } from "vitest";
import {
  addMonthsUTC,
  describeCommission,
  describeRetention,
  planRetentionBonuses,
  retentionBonusSourceKey,
  retentionDueAt,
  signupCommissionCents,
  snapshotTerms,
  type PlanTerms,
} from "../terms";
import { normalizeReferralCode, referralLandingPath, suggestReferralCode } from "../codes";

const plan = (over: Partial<PlanTerms> = {}) => ({
  id: "p1",
  name: "Standard",
  trainerCommissionType: "FIXED" as const,
  trainerCommissionValue: 5000,
  individualCommissionType: "PERCENT" as const,
  individualCommissionValue: 2000,
  retentionBonusCents: 20000,
  retentionRequiredCount: 4,
  retentionMonths: 2,
  retentionScope: "TRAINERS" as const,
  ...over,
});

describe("snapshotTerms", () => {
  it("copies the trainer commission and retention terms for a trainer", () => {
    expect(snapshotTerms(plan(), "TRAINER")).toEqual({
      planId: "p1",
      planName: "Standard",
      commissionType: "FIXED",
      commissionValue: 5000,
      retentionBonusCents: 20000,
      retentionRequiredCount: 4,
      retentionMonths: 2,
    });
  });

  it("uses the individual commission and drops trainer-only retention for an individual", () => {
    expect(snapshotTerms(plan(), "INDIVIDUAL")).toMatchObject({
      commissionType: "PERCENT",
      commissionValue: 2000,
      retentionBonusCents: 0,
      retentionRequiredCount: 0,
      retentionMonths: 0,
    });
  });

  it("applies retention to both types when scope is ALL", () => {
    expect(snapshotTerms(plan({ retentionScope: "ALL" }), "INDIVIDUAL").retentionBonusCents).toBe(20000);
  });

  it("ignores a half-configured retention bonus", () => {
    expect(snapshotTerms(plan({ retentionMonths: 0 }), "TRAINER").retentionBonusCents).toBe(0);
  });

  it("zeroes a NONE commission even if a stale value is stored", () => {
    expect(snapshotTerms(plan({ trainerCommissionType: "NONE" }), "TRAINER").commissionValue).toBe(0);
  });

  it("tracks at zero commission when the contractor has no plan", () => {
    expect(snapshotTerms(null, "TRAINER")).toMatchObject({ planId: null, commissionType: "NONE", commissionValue: 0 });
  });
});

describe("signupCommissionCents", () => {
  it("pays a fixed amount regardless of price", () => {
    expect(signupCommissionCents({ commissionType: "FIXED", commissionValue: 5000 }, 3999)).toBe(5000);
  });
  it("pays a percentage of the first payment, rounded to the cent", () => {
    expect(signupCommissionCents({ commissionType: "PERCENT", commissionValue: 2000 }, 3999)).toBe(800);
    expect(signupCommissionCents({ commissionType: "PERCENT", commissionValue: 1250 }, 7999)).toBe(1000);
  });
  it("pays nothing on a $0 invoice or with no commission", () => {
    expect(signupCommissionCents({ commissionType: "FIXED", commissionValue: 5000 }, 0)).toBe(0);
    expect(signupCommissionCents({ commissionType: "NONE", commissionValue: 5000 }, 3999)).toBe(0);
  });
});

describe("addMonthsUTC / retentionDueAt", () => {
  it("adds calendar months", () => {
    expect(addMonthsUTC(new Date("2026-03-15T10:00:00Z"), 2).toISOString()).toBe("2026-05-15T10:00:00.000Z");
  });
  it("clamps to the end of shorter months and crosses years", () => {
    expect(addMonthsUTC(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonthsUTC(new Date("2026-12-10T00:00:00Z"), 2).toISOString()).toBe("2027-02-10T00:00:00.000Z");
  });
  it("is null without a retention bonus or before payment", () => {
    const base = { retentionBonusCents: 20000, retentionRequiredCount: 4, retentionMonths: 2 };
    expect(retentionDueAt({ ...base, retentionStartAt: null })).toBeNull();
    expect(retentionDueAt({ ...base, retentionBonusCents: 0, retentionStartAt: new Date() })).toBeNull();
    expect(retentionDueAt({ ...base, retentionStartAt: new Date("2026-01-01T00:00:00Z") })?.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z"
    );
  });
});

describe("planRetentionBonuses", () => {
  const r = (id: string, day: number, over: Record<string, number> = {}) => ({
    id,
    retainedAt: new Date(Date.UTC(2026, 0, day)),
    retentionBonusCents: 20000,
    retentionRequiredCount: 4,
    retentionMonths: 2,
    ...over,
  });

  it("awards one bonus per full group, oldest qualifiers first", () => {
    const awards = planRetentionBonuses([r("e", 5), r("a", 1), r("c", 3), r("b", 2), r("d", 4)]);
    expect(awards).toHaveLength(1);
    expect(awards[0].bonusCents).toBe(20000);
    expect(awards[0].referrals.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("awards multiple bonuses and leaves the remainder pending", () => {
    const list = Array.from({ length: 9 }, (_, i) => r(`r${i}`, i + 1));
    expect(planRetentionBonuses(list).map((a) => a.referrals.length)).toEqual([4, 4]);
  });

  it("never mixes referrals made under different terms", () => {
    const old = [r("a", 1), r("b", 2)];
    const updated = [r("c", 3, { retentionBonusCents: 30000 }), r("d", 4, { retentionBonusCents: 30000 })];
    expect(planRetentionBonuses([...old, ...updated])).toHaveLength(0);
  });

  it("produces a stable idempotency key regardless of order", () => {
    expect(retentionBonusSourceKey("c1", ["b", "a"])).toBe(retentionBonusSourceKey("c1", ["a", "b"]));
  });
});

describe("descriptions", () => {
  it("reads like the client's example", () => {
    expect(describeRetention(plan())).toBe("$200.00 for every 4 trainers retained 2 months");
    expect(describeCommission("PERCENT", 2000)).toBe("20% of first payment");
    expect(describeCommission("FIXED", 5000)).toBe("$50.00 per paying subscriber");
  });
});

describe("referral codes", () => {
  it("normalizes case and whitespace and rejects junk", () => {
    expect(normalizeReferralCode("  jordan-7k3q ")).toBe("JORDAN-7K3Q");
    expect(normalizeReferralCode("ab")).toBeNull();
    expect(normalizeReferralCode("-ABC")).toBeNull();
    expect(normalizeReferralCode("AB C")).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
  });
  it("suggests a valid code from a name", () => {
    const code = suggestReferralCode("Jördan Lee", () => 0);
    expect(code).toBe("JORDANLEE-2222");
    expect(normalizeReferralCode(code)).toBe(code);
    expect(normalizeReferralCode(suggestReferralCode("李"))).not.toBeNull();
  });
  it("only lands on whitelisted pages", () => {
    expect(referralLandingPath("professionals")).toBe("/professionals");
    expect(referralLandingPath("https://evil.example")).toBe("/get-started");
    expect(referralLandingPath(null)).toBe("/get-started");
  });
});
