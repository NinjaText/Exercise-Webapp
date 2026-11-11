/**
 * Referral codes and the attribution cookie. Browser-safe (used by the
 * sign-up field as well as the server).
 */

/** Set by /r/<code>; read when the account is onboarded. Last click wins. */
export const REFERRAL_COOKIE = "mia_ref";
export const REFERRAL_COOKIE_DAYS = 60;

export const referralCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: REFERRAL_COOKIE_DAYS * 24 * 60 * 60,
};

const CODE_RE = /^[A-Z0-9](?:[A-Z0-9-]{1,22}[A-Z0-9])$/;
export const REFERRAL_CODE_RULES = "3–24 characters: letters, numbers and dashes (not at the ends).";

/** Canonical form (uppercase, trimmed) or null when it can't be a code. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** A readable code from a name, e.g. "Jordan Lee" → "JORDAN-7K3Q". */
export function suggestReferralCode(name: string, random: () => number = Math.random): string {
  const stem =
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 10) || "MIA";
  // No 0/O/1/I so codes read cleanly when spoken or typed.
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `${stem.length >= 2 ? stem : `${stem}X`}-${suffix}`;
}

/** Marketing pages a referral link may land on (`/r/<code>?to=…`). */
export const REFERRAL_LANDING_PAGES = {
  "get-started": "/get-started",
  home: "/",
  professionals: "/professionals",
  individuals: "/individuals",
  pricing: "/pricing",
} as const;

export function referralLandingPath(to: string | null | undefined): string {
  return (to && REFERRAL_LANDING_PAGES[to as keyof typeof REFERRAL_LANDING_PAGES]) || REFERRAL_LANDING_PAGES["get-started"];
}

export function referralLinkPath(code: string): string {
  return `/r/${encodeURIComponent(code)}`;
}
