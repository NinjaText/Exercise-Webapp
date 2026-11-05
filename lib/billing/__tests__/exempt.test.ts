import { afterEach, describe, expect, it } from "vitest";
import { isBillingExempt } from "../exempt";

const saved = { b: process.env.BILLING_EXEMPT_EMAILS, s: process.env.SUPER_ADMIN_EMAILS };
afterEach(() => {
  process.env.BILLING_EXEMPT_EMAILS = saved.b;
  process.env.SUPER_ADMIN_EMAILS = saved.s;
});

describe("isBillingExempt", () => {
  it("exempts emails in BILLING_EXEMPT_EMAILS, case- and space-insensitive", () => {
    process.env.BILLING_EXEMPT_EMAILS = " Me@Team.com , other@x.com";
    process.env.SUPER_ADMIN_EMAILS = "";
    expect(isBillingExempt({ email: "me@team.com" })).toBe(true);
    expect(isBillingExempt({ email: "OTHER@x.com" })).toBe(true);
    expect(isBillingExempt({ email: "stranger@x.com" })).toBe(false);
  });

  it("exempts super admins", () => {
    process.env.BILLING_EXEMPT_EMAILS = "";
    process.env.SUPER_ADMIN_EMAILS = "admin@team.com";
    expect(isBillingExempt({ email: "admin@team.com" })).toBe(true);
  });

  it("is false with no env, no flag, or no email", () => {
    delete process.env.BILLING_EXEMPT_EMAILS;
    delete process.env.SUPER_ADMIN_EMAILS;
    expect(isBillingExempt({ email: "x@y.com" })).toBe(false);
    expect(isBillingExempt({ email: null })).toBe(false);
  });
});
