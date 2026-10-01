import { describe, it, expect } from "vitest";
import type { CoachingStatus } from "@prisma/client";
import { coachingPanelActions, memberCoachingLinkLabel, nextCoachingStatus, type CoachingEvent } from "../coaching-state";

const STATUSES: (CoachingStatus | null)[] = [null, "REQUESTED", "ACCEPTED", "ACTIVE", "PAST_DUE", "DECLINED", "CANCELED"];
const EVENTS: CoachingEvent[] = [
  "member_request", "trainer_accept", "trainer_decline", "member_withdraw", "trainer_withdraw",
  "payment_succeeded", "payment_failed", "subscription_ended", "membership_ended",
];

/** Spec §6 table, verbatim. Every pair not listed here must be rejected. */
const VALID: Array<[CoachingStatus | null, CoachingEvent, CoachingStatus]> = [
  [null, "member_request", "REQUESTED"],
  ["DECLINED", "member_request", "REQUESTED"],
  ["CANCELED", "member_request", "REQUESTED"],
  ["REQUESTED", "trainer_accept", "ACCEPTED"],
  ["REQUESTED", "trainer_decline", "DECLINED"],
  ["REQUESTED", "member_withdraw", "CANCELED"],
  ["REQUESTED", "trainer_withdraw", "CANCELED"],
  ["ACCEPTED", "member_withdraw", "CANCELED"],
  ["ACCEPTED", "trainer_withdraw", "CANCELED"],
  ["ACCEPTED", "payment_succeeded", "ACTIVE"],
  ["ACTIVE", "payment_failed", "PAST_DUE"],
  ["PAST_DUE", "payment_succeeded", "ACTIVE"],
  ["ACTIVE", "subscription_ended", "CANCELED"],
  ["PAST_DUE", "subscription_ended", "CANCELED"],
  ["REQUESTED", "membership_ended", "CANCELED"],
  ["ACCEPTED", "membership_ended", "CANCELED"],
  ["ACTIVE", "membership_ended", "CANCELED"],
  ["PAST_DUE", "membership_ended", "CANCELED"],
];

describe("nextCoachingStatus", () => {
  it.each(VALID)("%s + %s → %s", (from, event, to) => {
    expect(nextCoachingStatus(from, event)).toBe(to);
  });

  const invalid = STATUSES.flatMap((from) =>
    EVENTS.filter((event) => !VALID.some(([f, e]) => f === from && e === event)).map(
      (event) => [from, event] as const
    )
  );

  it("covers the full status × event grid", () => {
    expect(invalid.length + VALID.length).toBe(STATUSES.length * EVENTS.length);
  });

  it.each(invalid)("rejects %s + %s", (from, event) => {
    expect(nextCoachingStatus(from, event)).toBeNull();
  });
});

describe("coachingPanelActions", () => {
  it("offers the actions valid for each status", () => {
    expect(coachingPanelActions(null)).toEqual([]);
    expect(coachingPanelActions("REQUESTED")).toEqual(["accept", "decline"]);
    expect(coachingPanelActions("ACCEPTED")).toEqual(["withdraw"]);
    expect(coachingPanelActions("ACTIVE")).toEqual(["end"]);
    expect(coachingPanelActions("PAST_DUE")).toEqual(["end"]);
    expect(coachingPanelActions("DECLINED")).toEqual([]);
    expect(coachingPanelActions("CANCELED")).toEqual([]);
  });

  it("offers no End once the cancellation is scheduled", () => {
    expect(coachingPanelActions("ACTIVE", true)).toEqual([]);
  });
});

describe("memberCoachingLinkLabel (/billing coaching card)", () => {
  it("offers to start an accepted offer", () => {
    expect(memberCoachingLinkLabel("ACCEPTED")).toBe("Start coaching on your dashboard");
  });

  it.each([null, "DECLINED", "CANCELED"] as const)("offers a (re-)request for %s", (status) => {
    expect(memberCoachingLinkLabel(status)).toBe("Request coaching on your dashboard");
  });

  it.each(["REQUESTED", "ACTIVE", "PAST_DUE"] as const)("no link for %s", (status) => {
    expect(memberCoachingLinkLabel(status)).toBeNull();
  });
});
