import { describe, expect, it } from "vitest";
import { ACTIVE_NOW_WINDOW_MS, LAST_ACTIVE_THROTTLE_MS, lastActiveStatus } from "@/lib/activity/constants";
import { isLastActiveStale } from "@/lib/activity/last-active";

const NOW = new Date("2026-11-12T12:00:00Z").getTime();

describe("isLastActiveStale", () => {
  it("is stale when never recorded", () => {
    expect(isLastActiveStale(null, NOW)).toBe(true);
    expect(isLastActiveStale(undefined, NOW)).toBe(true);
  });
  it("skips the write inside the throttle window", () => {
    expect(isLastActiveStale(new Date(NOW - LAST_ACTIVE_THROTTLE_MS + 1000), NOW)).toBe(false);
  });
  it("writes once the throttle window has passed", () => {
    expect(isLastActiveStale(new Date(NOW - LAST_ACTIVE_THROTTLE_MS), NOW)).toBe(true);
  });
});

describe("lastActiveStatus", () => {
  it("reports never for missing or invalid values", () => {
    expect(lastActiveStatus(null, NOW).kind).toBe("never");
    expect(lastActiveStatus("not a date", NOW).kind).toBe("never");
  });
  it("reports active now inside the window", () => {
    expect(lastActiveStatus(new Date(NOW - ACTIVE_NOW_WINDOW_MS + 1000), NOW).kind).toBe("now");
  });
  it("reports past outside the window", () => {
    expect(lastActiveStatus(new Date(NOW - ACTIVE_NOW_WINDOW_MS), NOW).kind).toBe("past");
  });
});
