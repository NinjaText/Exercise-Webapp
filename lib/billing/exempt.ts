import { isSuperAdminEmail } from "@/lib/auth/super-admin-emails";

/** True when `email` is in BILLING_EXEMPT_EMAILS (comma-separated, case-insensitive). */
export function isBillingExemptEmail(email: string): boolean {
  return (process.env.BILLING_EXEMPT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

/**
 * Complimentary access: skips every billing gate (trainer trial/subscription
 * and club-member trial/subscription). Granted by:
 *  - BILLING_EXEMPT_EMAILS env list (works before the account even exists),
 *  - SUPER_ADMIN_EMAILS env list (admins never pay).
 * Super admins flagged only via Clerk publicMetadata are covered by callers
 * that also check `isSuperAdmin()` (it needs the session).
 */
export function isBillingExempt(user: { email?: string | null }): boolean {
  if (!user.email) return false;
  return isBillingExemptEmail(user.email) || isSuperAdminEmail(user.email);
}
