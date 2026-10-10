import { describe, it, expect } from "vitest";
import {
  getOrgType,
  getOrgCapabilities,
  getUserCapabilities,
  needsCoachingLookup,
  canPairInteract,
  hiddenNavHrefs,
  hiddenSettingsTabHrefs,
  MESSAGING_UNAVAILABLE,
  CHECK_INS_UNAVAILABLE,
} from "@/lib/org-capabilities";

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
      trainerBilling: true,
    });
    expect(getOrgCapabilities(null)).toEqual(getOrgCapabilities({ type: "TRAINER" }));
  });
  it("makes club orgs member-billed and self-guided (the uncoached-member default)", () => {
    expect(getOrgCapabilities({ type: "CLUB" })).toEqual({
      billing: "member",
      messaging: false,
      checkIns: false,
      coachNotifications: false,
      trainerBilling: true,
    });
    expect(getOrgCapabilities({ type: "CLUB" })).toEqual(
      getUserCapabilities({ orgType: "CLUB", role: "CLIENT", coachingActive: false })
    );
  });
});

// Spec §4 table: who → billing, messaging, checkIns, coachNotifications, hidden nav.
describe("getUserCapabilities (spec §4)", () => {
  const full = { messaging: true, checkIns: true, coachNotifications: true };
  const off = { messaging: false, checkIns: false, coachNotifications: false };

  it.each([
    ["TRAINER", false],
    ["TRAINER", true],
    ["CLIENT", false],
    ["CLIENT", true],
  ] as const)("trainer-org %s (coachingActive=%s) gets the full set", (role, coachingActive) => {
    const caps = getUserCapabilities({ orgType: "TRAINER", role, coachingActive });
    expect(caps).toEqual({ billing: "trainer", ...full, trainerBilling: true });
    expect(hiddenNavHrefs(caps)).toEqual([]);
  });

  it("club trainer coaches but never pays", () => {
    const caps = getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false });
    expect(caps).toEqual({ billing: "member", ...full, trainerBilling: false });
    expect(hiddenNavHrefs(caps)).toEqual(["/settings/billing"]);
  });

  it("uncoached club member is self-guided", () => {
    const caps = getUserCapabilities({ orgType: "CLUB", role: "CLIENT", coachingActive: false });
    expect(caps).toEqual({ billing: "member", ...off, trainerBilling: true });
    expect(hiddenNavHrefs(caps)).toEqual(["/messages", "/check-ins"]);
  });

  it("coached club member gets messaging, check-ins and coach notifications", () => {
    const caps = getUserCapabilities({ orgType: "CLUB", role: "CLIENT", coachingActive: true });
    expect(caps).toEqual({ billing: "member", ...full, trainerBilling: true });
    expect(hiddenNavHrefs(caps)).toEqual([]);
  });
});

describe("needsCoachingLookup", () => {
  it("is true only for a club member", () => {
    expect(needsCoachingLookup("CLUB", "CLIENT")).toBe(true);
    expect(needsCoachingLookup("CLUB", "TRAINER")).toBe(false);
    expect(needsCoachingLookup("TRAINER", "CLIENT")).toBe(false);
    expect(needsCoachingLookup("TRAINER", "TRAINER")).toBe(false);
  });
});

describe("canPairInteract", () => {
  const orgTrainer = getUserCapabilities({ orgType: "TRAINER", role: "TRAINER", coachingActive: false });
  const orgClient = getUserCapabilities({ orgType: "TRAINER", role: "CLIENT", coachingActive: false });
  const clubTrainer = getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false });
  const coached = getUserCapabilities({ orgType: "CLUB", role: "CLIENT", coachingActive: true });
  const uncoached = getUserCapabilities({ orgType: "CLUB", role: "CLIENT", coachingActive: false });
  const pair = (sender: typeof orgTrainer, recipient: typeof orgTrainer, sameOrg: boolean) =>
    canPairInteract({ sender, recipient, sameOrg, cap: "messaging" });

  it("keeps trainer-org senders on today's rules (org not required)", () => {
    expect(pair(orgTrainer, orgClient, true)).toBe(true);
    expect(pair(orgTrainer, orgClient, false)).toBe(true);
  });
  it("limits a club trainer to coached members of their own club", () => {
    expect(pair(clubTrainer, coached, true)).toBe(true);
    expect(pair(clubTrainer, coached, false)).toBe(false);
    expect(pair(clubTrainer, uncoached, true)).toBe(false);
    expect(pair(clubTrainer, orgClient, false)).toBe(false);
  });
  it("needs the capability on the sender too", () => {
    expect(pair(uncoached, orgTrainer, true)).toBe(false);
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
  it("has a check-in counterpart for trainer assignment", () => {
    expect(CHECK_INS_UNAVAILABLE).toBe("Check-ins aren't available for this client.");
  });
});

describe("hiddenSettingsTabHrefs", () => {
  const caps = getUserCapabilities({ orgType: "CLUB", role: "TRAINER", coachingActive: false });
  it("adds the Account tab only for a house coach", () => {
    expect(hiddenSettingsTabHrefs(caps)).toEqual(["/settings/billing"]);
    expect(hiddenSettingsTabHrefs(caps, { houseCoach: true })).toEqual(["/settings/billing", "/settings"]);
  });
});
