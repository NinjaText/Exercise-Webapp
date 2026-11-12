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
 *  - a super admin from /admin/users (User.billingExemptAt),
 *  - BILLING_EXEMPT_EMAILS env list (works before the account even exists),
 *  - SUPER_ADMIN_EMAILS env list (admins never pay).
 * Super admins flagged only via Clerk publicMetadata are covered by callers
 * that also check `isSuperAdmin()` (it needs the session).
 */
// `billingExemptAt` is a required key so every caller must load it (a `select`
// that forgets it is a type error rather than a silent "not exempt").
export function isBillingExempt(user: { email?: string | null; billingExemptAt: Date | null }): boolean {
  if (user.billingExemptAt) return true;
  if (!user.email) return false;
  return isBillingExemptEmail(user.email) || isSuperAdminEmail(user.email);
}

export type FreeAccessKind = "none" | "granted" | "env";

/** "granted" = given by an admin (removable in /admin/users); "env" = from the env lists. */
export function freeAccessKind(user: { email?: string | null; billingExemptAt: Date | null }): FreeAccessKind {
  if (user.billingExemptAt) return "granted";
  return isBillingExempt(user) ? "env" : "none";
}
