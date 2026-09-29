import { describe, it, expect } from "vitest";
import { getOrgType, getOrgCapabilities, hiddenNavHrefs, MESSAGING_UNAVAILABLE } from "@/lib/org-capabilities";

describe("getOrgType", () => {
  it("treats a missing org or missing type as TRAINER", () => {
    expect(getOrgType(null)).toBe("TRAINER");
    expect(getOrgType(undefined)).toBe("TRAINER");
    expect(getOrgType({})).toBe("TRAINER");
    expect(getOrgType({ type: null })).toBe("TRAINER");
  });
  it("returns CLUB for club orgs", () => {
    expect(getOrgType({ type: "CLUB" })).toBe("CLUB");
  });
});

describe("getOrgCapabilities", () => {
  it("gives trainer orgs today's full feature set", () => {
    expect(getOrgCapabilities({ type: "TRAINER" })).toEqual({
      billing: "trainer",
      messaging: true,
      checkIns: true,
      coachNotifications: true,
    });
    expect(getOrgCapabilities(null)).toEqual(getOrgCapabilities({ type: "TRAINER" }));
  });
  it("makes club orgs member-billed and self-guided", () => {
    expect(getOrgCapabilities({ type: "CLUB" })).toEqual({
      billing: "member",
      messaging: false,
      checkIns: false,
      coachNotifications: false,
    });
  });
});

describe("hiddenNavHrefs", () => {
  it("hides nothing for trainer orgs", () => {
    expect(hiddenNavHrefs(getOrgCapabilities(null))).toEqual([]);
  });
  it("hides inbox and check-ins for clubs", () => {
    expect(hiddenNavHrefs(getOrgCapabilities({ type: "CLUB" }))).toEqual(["/messages", "/check-ins"]);
  });
});

describe("MESSAGING_UNAVAILABLE", () => {
  it("is the user-facing error for blocked message sends", () => {
    expect(MESSAGING_UNAVAILABLE).toBe("Messaging isn't available for your account.");
  });
});
