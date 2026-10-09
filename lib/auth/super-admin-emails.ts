/** True when `email` is in the SUPER_ADMIN_EMAILS env fallback (comma-separated, case-insensitive). */
export function isSuperAdminEmail(email: string): boolean {
  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes(email.toLowerCase());
}
