import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived proof that a browser typed a club's access code, carried across
 * the Clerk sign-up redirect in an httpOnly cookie. Format:
 *   <clerkOrgId>.<expiresAtMs>.<base64url HMAC-SHA256>
 * Clerk org ids contain no "." so the split is unambiguous.
 */
export const JOIN_COOKIE = "club_join";
export const JOIN_TOKEN_TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const s = process.env.CLUB_JOIN_SECRET;
  if (!s || s.length < 32) throw new Error("CLUB_JOIN_SECRET must be set (≥32 chars)");
  return s;
}

function mac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match for timingSafeEqual.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function signJoinToken(clerkOrgId: string, now = Date.now()): string {
  const payload = `${clerkOrgId}.${now + JOIN_TOKEN_TTL_MS}`;
  return `${payload}.${mac(payload)}`;
}

export function verifyJoinToken(token: string | undefined, clerkOrgId: string, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [orgId, expRaw, signature] = parts;
  const exp = Number(expRaw);
  if (orgId !== clerkOrgId || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(signature, mac(`${orgId}.${expRaw}`));
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

export function joinCodesMatch(input: string, expected: string | null): boolean {
  if (!expected) return false;
  const normalized = normalizeJoinCode(input);
  if (!normalized) return false;
  return safeEqual(normalized, normalizeJoinCode(expected));
}
