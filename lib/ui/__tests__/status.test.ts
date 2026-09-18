import { describe, it, expect } from "vitest";
import {
  statusRole,
  statusLabel,
  normalizeStatus,
  ROLE_CLASSES,
  STATUS_ROLES,
} from "../status";

describe("normalizeStatus", () => {
  it("upper-snake-cases camelCase, spaces and dashes", () => {
    expect(normalizeStatus("onTrack")).toBe("ON_TRACK");
    expect(normalizeStatus("on track")).toBe("ON_TRACK");
    expect(normalizeStatus("on-track")).toBe("ON_TRACK");
    expect(normalizeStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
  });
});

describe("statusRole", () => {
  it.each([
    ["SCHEDULED", "info"],
    ["IN_PROGRESS", "info"],
    ["DRAFT", "info"],
    ["STARTING_SOON", "info"],
    ["EARLY", "info"],
    ["COMPLETED", "success"],
    ["ACTIVE", "success"],
    ["ON_TRACK", "success"],
    ["ON_TIME", "success"],
    ["MISSED", "warning"],
    ["PAUSED", "warning"],
    ["ON_HOLD", "warning"],
    ["AT_RISK", "warning"],
    ["PAST_DUE", "warning"],
    ["TRIALING", "warning"],
    ["LATE", "warning"],
    ["DELAYED", "warning"],
    ["ABANDONED", "danger"],
    ["OFF_TRACK", "danger"],
    ["CANCELED", "danger"],
    ["UNPAID", "danger"],
    ["SKIPPED", "neutral"],
    ["ARCHIVED", "neutral"],
    ["RESOURCE", "neutral"],
    ["TEMPLATE", "neutral"],
    ["INACTIVE", "neutral"],
    ["AI_GENERATED", "brand"],
    ["INSIGHT", "brand"],
    ["HIGH", "danger"],
    ["MEDIUM", "warning"],
    ["LOW", "success"],
    ["TRAINER", "brand"],
    ["CLIENT", "info"],
    ["SUPER_ADMIN", "brand"],
    ["PUBLIC", "success"],
    ["PRIVATE", "neutral"],
    ["PENDING", "warning"],
    ["ACCEPTED", "success"],
    ["REVOKED", "neutral"],
    ["EXPIRED", "neutral"],
    ["ONBOARDING", "info"],
  ])("maps %s to %s", (status, role) => {
    expect(statusRole(status)).toBe(role);
  });

  it("accepts camelCase and lower-case inputs", () => {
    expect(statusRole("offTrack")).toBe("danger");
    expect(statusRole("completed")).toBe("success");
  });

  it("falls back to neutral for unknown, null and undefined", () => {
    expect(statusRole("SOMETHING_NEW")).toBe("neutral");
    expect(statusRole(null)).toBe("neutral");
    expect(statusRole(undefined)).toBe("neutral");
  });
});

describe("statusLabel", () => {
  it("humanizes upper-snake status strings", () => {
    expect(statusLabel("IN_PROGRESS")).toBe("In progress");
    expect(statusLabel("COMPLETED")).toBe("Completed");
    expect(statusLabel("onTrack")).toBe("On track");
  });
});

describe("ROLE_CLASSES", () => {
  it("defines soft, text, dot and border classes for every role", () => {
    for (const role of STATUS_ROLES) {
      expect(ROLE_CLASSES[role].soft).toBe(`bg-${role}-soft`);
      expect(ROLE_CLASSES[role].text).toBe(`text-${role}-foreground`);
      expect(ROLE_CLASSES[role].dot).toBe(`bg-${role}`);
      expect(ROLE_CLASSES[role].border).toBe(`border-${role}-border`);
    }
  });
});
