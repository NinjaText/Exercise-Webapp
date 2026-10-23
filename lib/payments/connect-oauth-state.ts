import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The `state` parameter for the Stripe Connect OAuth round-trip (CSRF guard).
 * Bound to the trainer who started it, so a code minted for one trainer can
 * never be attached to another trainer's MIA account. Format:
 *   <trainerId>.<expiresAtMs>.<nonce>.<base64url HMAC-SHA256>
 * Trainer ids are Mongo ObjectIds (hex), so "." never appears inside a part.
 */
export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

/** Derived from the Clerk secret (no extra env var); the label scopes the key to this purpose. */
function secret(): Buffer {
  const base = process.env.CLERK_SECRET_KEY;
  if (!base || base.length < 20) throw new Error("CLERK_SECRET_KEY must be set to sign Stripe Connect OAuth state");
  return createHmac("sha256", base).update("stripe-connect-oauth-state:v1").digest();
}

function mac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function signConnectOAuthState(trainerId: string, now = Date.now()): string {
  const nonce = randomBytes(9).toString("base64url");
  const payload = `${trainerId}.${now + OAUTH_STATE_TTL_MS}.${nonce}`;
  return `${payload}.${mac(payload)}`;
}

/** True only for an unexpired state this server signed for exactly this trainer. */
export function verifyConnectOAuthState(state: string | null | undefined, trainerId: string, now = Date.now()): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [stateTrainerId, expRaw, nonce, signature] = parts;
  const exp = Number(expRaw);
  if (stateTrainerId !== trainerId || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(signature, mac(`${stateTrainerId}.${expRaw}.${nonce}`));
}
