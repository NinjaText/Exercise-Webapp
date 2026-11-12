import { afterEach, describe, expect, it } from "vitest";
import { freeAccessKind, isBillingExempt } from "../exempt";

const saved = { b: process.env.BILLING_EXEMPT_EMAILS, s: process.env.SUPER_ADMIN_EMAILS };
afterEach(() => {
  process.env.BILLING_EXEMPT_EMAILS = saved.b;
  process.env.SUPER_ADMIN_EMAILS = saved.s;
});

describe("isBillingExempt", () => {
  it("exempts emails in BILLING_EXEMPT_EMAILS, case- and space-insensitive", () => {
    process.env.BILLING_EXEMPT_EMAILS = " Me@Team.com , other@x.com";
    process.env.SUPER_ADMIN_EMAILS = "";
    expect(isBillingExempt({ email: "me@team.com", billingExemptAt: null })).toBe(true);
    expect(isBillingExempt({ email: "OTHER@x.com", billingExemptAt: null })).toBe(true);
    expect(isBillingExempt({ email: "stranger@x.com", billingExemptAt: null })).toBe(false);
  });

  it("exempts super admins", () => {
    process.env.BILLING_EXEMPT_EMAILS = "";
    process.env.SUPER_ADMIN_EMAILS = "admin@team.com";
    expect(isBillingExempt({ email: "admin@team.com", billingExemptAt: null })).toBe(true);
  });

  it("is false with no env, no flag, or no email", () => {
    delete process.env.BILLING_EXEMPT_EMAILS;
    delete process.env.SUPER_ADMIN_EMAILS;
    expect(isBillingExempt({ email: "x@y.com", billingExemptAt: null })).toBe(false);
    expect(isBillingExempt({ email: null, billingExemptAt: null })).toBe(false);
  });
  it("exempts accounts an admin gave free access, whatever the env lists say", () => {
    delete process.env.BILLING_EXEMPT_EMAILS;
    expect(isBillingExempt({ email: "x@y.com", billingExemptAt: new Date() })).toBe(true);
    expect(freeAccessKind({ email: "x@y.com", billingExemptAt: new Date() })).toBe("granted");
    expect(freeAccessKind({ email: "x@y.com", billingExemptAt: null })).toBe("none");
    process.env.BILLING_EXEMPT_EMAILS = "x@y.com";
    expect(freeAccessKind({ email: "x@y.com", billingExemptAt: null })).toBe("env");
  });
});
