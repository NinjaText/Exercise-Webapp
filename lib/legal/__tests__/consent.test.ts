import { describe, it, expect } from "vitest";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  buildSignUpConsent,
  consentFieldsFromClerkUser,
  isProfessionalRole,
} from "../consent";

const createdAt = Date.UTC(2026, 10, 7, 12);

describe("consentFieldsFromClerkUser", () => {
  it("maps sign-up consent to User fields, timed at Clerk account creation", () => {
    const fields = consentFieldsFromClerkUser({
      unsafeMetadata: { legalConsent: buildSignUpConsent(true) },
      createdAt,
    });
    expect(fields).toEqual({
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(createdAt),
      privacyVersion: PRIVACY_VERSION,
      privacyAcceptedAt: new Date(createdAt),
      marketingEmailsOptIn: true,
      marketingConsentAt: new Date(createdAt),
    });
  });

  it("records no consent when the metadata is missing or malformed", () => {
    expect(consentFieldsFromClerkUser({ unsafeMetadata: {}, createdAt })).toEqual({});
    expect(consentFieldsFromClerkUser({ unsafeMetadata: { legalConsent: { termsVersion: 1 } }, createdAt })).toEqual({});
    expect(consentFieldsFromClerkUser({ createdAt })).toEqual({});
  });

  it("treats anything but true as no marketing opt-in", () => {
    const fields = consentFieldsFromClerkUser({
      unsafeMetadata: { legalConsent: { termsVersion: "a", privacyVersion: "b", marketingEmails: "yes" } },
      createdAt,
    });
    expect(fields).toMatchObject({ marketingEmailsOptIn: false });
  });
});

describe("isProfessionalRole", () => {
  it("accepts listed roles only", () => {
    expect(isProfessionalRole("physical_therapist")).toBe(true);
    expect(isProfessionalRole("surgeon")).toBe(false);
    expect(isProfessionalRole(undefined)).toBe(false);
  });
});
