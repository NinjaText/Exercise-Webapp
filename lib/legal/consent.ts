/**
 * Sign-up clickwrap: which legal revisions a user accepted, and the
 * professional PHI attestation. Browser-safe (used by the sign-up form).
 *
 * Bump a version whenever docs/legal/*.docx is replaced with a new revision
 * (use the document's "Last Updated" date), so we know who accepted what.
 */
export const TERMS_VERSION = "2026-11-06";
export const PRIVACY_VERSION = "2026-11-06";

export const LEGAL_CONTACT_EMAIL = "legal@miaperformance.com";

/** Written to Clerk `unsafeMetadata.legalConsent` by the sign-up form. */
export interface SignUpLegalConsent {
  termsVersion: string;
  privacyVersion: string;
  marketingEmails: boolean;
}

export function buildSignUpConsent(marketingEmails: boolean): SignUpLegalConsent {
  return { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, marketingEmails };
}

function parseConsent(unsafeMetadata: unknown): SignUpLegalConsent | null {
  const raw = (unsafeMetadata as { legalConsent?: unknown } | null | undefined)?.legalConsent;
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.termsVersion !== "string" || typeof c.privacyVersion !== "string") return null;
  return {
    termsVersion: c.termsVersion.slice(0, 32),
    privacyVersion: c.privacyVersion.slice(0, 32),
    marketingEmails: c.marketingEmails === true,
  };
}

/**
 * User fields to persist from the Clerk user's sign-up consent, or `{}` when
 * there is none. The acceptance time is Clerk's account-creation time (server
 * side), not a client-supplied timestamp.
 */
export function consentFieldsFromClerkUser(clerkUser: { unsafeMetadata?: unknown; createdAt: number }) {
  const consent = parseConsent(clerkUser.unsafeMetadata);
  if (!consent) return {};
  const at = new Date(clerkUser.createdAt);
  return {
    termsVersion: consent.termsVersion,
    termsAcceptedAt: at,
    privacyVersion: consent.privacyVersion,
    privacyAcceptedAt: at,
    marketingEmailsOptIn: consent.marketingEmails,
    marketingConsentAt: at,
  };
}

// ── Professional accounts ─────────────────────────────────────────────────

export const PROFESSIONAL_ROLES = [
  { value: "personal_trainer", label: "Personal Trainer" },
  { value: "physical_therapist", label: "Physical Therapist" },
  { value: "strength_conditioning", label: "Strength & Conditioning Coach" },
  { value: "athletic_trainer", label: "Athletic Trainer" },
  { value: "fitness_coach", label: "Fitness / Sports Coach" },
  { value: "nutrition_professional", label: "Nutrition Professional / Dietitian" },
  { value: "chiropractor", label: "Chiropractor" },
  { value: "massage_therapist", label: "Massage Therapist" },
  { value: "wellness_provider", label: "Wellness Provider" },
  { value: "other", label: "Other" },
] as const;

export type ProfessionalRole = (typeof PROFESSIONAL_ROLES)[number]["value"];

export function isProfessionalRole(value: unknown): value is ProfessionalRole {
  return PROFESSIONAL_ROLES.some((r) => r.value === value);
}
