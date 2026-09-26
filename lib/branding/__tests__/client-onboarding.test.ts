import { describe, it, expect } from "vitest";
import { resolveClientOnboardingOrgId } from "../client-onboarding";

describe("resolveClientOnboardingOrgId", () => {
  it("uses the DB user's clerkOrgId once the user row exists", () => {
    expect(resolveClientOnboardingOrgId({ clerkOrgId: "org_1" }, "org_2")).toBe("org_1");
  });

  it("uses the DB user's clerkOrgId (even null) over the session claim", () => {
    expect(resolveClientOnboardingOrgId({ clerkOrgId: null }, "org_2")).toBeNull();
  });

  it("falls back to the session's orgId when there is no DB user yet", () => {
    expect(resolveClientOnboardingOrgId(null, "org_2")).toBe("org_2");
  });

  it("is null when neither a DB user nor a session orgId is available", () => {
    expect(resolveClientOnboardingOrgId(null, null)).toBeNull();
  });
});
