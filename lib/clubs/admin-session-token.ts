/**
 * Signed marker proving a house-coach browser session was opened by a super
 * admin through "Manage club" (spec H8/H9). Format:
 *   <base64url JSON ClubAdminMarker>.<base64url HMAC-SHA256>
 *
 * Web Crypto only (no node: imports) so `proxy.ts` can verify it.
 */

export const CLUB_ADMIN_COOKIE = "club_admin_session";
export const CLUB_ADMIN_SESSION_HOURS = 8;

export interface ClubAdminMarker {
  sid: string;
  adminUserId: string;
  adminName: string;
  clerkOrgId: string;
  houseCoachClerkId: string;
  /** Epoch ms. */
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Signing key derived from the Clerk secret so there is no extra env var
 * (same approach as lib/clubs/join-token.ts). The label scopes it to this one
 * purpose.
 */
function signingKey(base: string): Promise<CryptoKey> {
  let key = keyCache.get(base);
  if (!key) {
    key = (async () => {
      const root = await crypto.subtle.importKey("raw", encoder.encode(base), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const derived = await crypto.subtle.sign("HMAC", root, encoder.encode("club-admin-session:v1"));
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    })();
    keyCache.set(base, key);
  }
  return key;
}

function resolveSecret(secret: string | undefined): string | null {
  const base = secret ?? process.env.CLERK_SECRET_KEY;
  return base && base.length >= 20 ? base : null;
}

function isMarker(value: unknown): value is ClubAdminMarker {
  const m = value as Record<string, unknown> | null;
  return (
    !!m &&
    typeof m === "object" &&
    typeof m.sid === "string" &&
    typeof m.adminUserId === "string" &&
    typeof m.adminName === "string" &&
    typeof m.clerkOrgId === "string" &&
    typeof m.houseCoachClerkId === "string" &&
    typeof m.exp === "number" &&
    Number.isFinite(m.exp)
  );
}

export async function signClubAdminMarker(m: ClubAdminMarker, secret?: string): Promise<string> {
  const base = resolveSecret(secret);
  if (!base) throw new Error("CLERK_SECRET_KEY must be set to sign club admin sessions");
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        sid: m.sid,
        adminUserId: m.adminUserId,
        adminName: m.adminName,
        clerkOrgId: m.clerkOrgId,
        houseCoachClerkId: m.houseCoachClerkId,
        exp: m.exp,
      }),
    ),
  );
  const signature = await crypto.subtle.sign("HMAC", await signingKey(base), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The marker when the signature checks out and it has not expired; otherwise null. */
export async function verifyClubAdminMarker(
  token: string | undefined,
  secret?: string,
  now = Date.now(),
): Promise<ClubAdminMarker | null> {
  if (!token) return null;
  const base = resolveSecret(secret);
  if (!base) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signatureRaw] = parts;
  const signature = fromBase64Url(signatureRaw);
  if (!payload || !signature) return null;
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify("HMAC", await signingKey(base), signature, encoder.encode(payload));
  if (!valid) return null;
  const bytes = fromBase64Url(payload);
  if (!bytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  if (!isMarker(parsed) || parsed.exp < now) return null;
  return parsed;
}

/**
 * Proxy decision for spec H9: true → redirect to /club-session/ended. A house
 * coach session is only valid alongside a live marker issued for that exact
 * house coach; anyone else is unaffected.
 */
export async function houseCoachSessionInvalid(args: {
  isHouseCoach: boolean;
  userId: string | null;
  cookie: string | undefined;
  pathname: string;
  now?: number;
}): Promise<boolean> {
  const { isHouseCoach, userId, cookie, pathname, now } = args;
  if (!isHouseCoach) return false;
  // The session pages themselves must stay reachable (no redirect loop), and
  // webhooks never carry a browser session.
  if (pathname.startsWith("/club-session/") || pathname.startsWith("/api/webhooks")) return false;
  const marker = await verifyClubAdminMarker(cookie, undefined, now);
  return !marker || marker.houseCoachClerkId !== userId;
}
