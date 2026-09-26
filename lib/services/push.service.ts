import "server-only";
import crypto from "node:crypto";
import http2 from "node:http2";
import { listDevices, removeTokens } from "@/lib/services/push-device.service";

/**
 * Push delivery: FCM (via firebase-admin) for Android, APNs over HTTP/2 for iOS.
 *
 * The builders and classifiers are pure and carry the tests. The two default
 * transports are the only network code; each returns `null` when its platform
 * is not configured, so delivery degrades to "skip" rather than failing.
 *
 * Env values are secrets: nothing here logs them, and configuration errors are
 * reported with fixed messages rather than the underlying error text (a JSON
 * parse error, for example, echoes part of its input).
 */

export interface PushMessage {
  title: string;
  body?: string;
  link?: string;
}

export type SendOutcome =
  | { token: string; ok: true }
  | { token: string; ok: false; dead: boolean };

export interface PushTransports {
  sendFcm(tokens: string[], msg: PushMessage): Promise<SendOutcome[]> | null;
  sendApns(tokens: string[], msg: PushMessage): Promise<SendOutcome[]> | null;
}

/** Upper bound on one transport batch; on expiry its outcomes are transient. */
const PUSH_TIMEOUT_MS = 10_000;

const APNS_TOPIC = "com.goinmotus.app";
const APNS_HOST_PRODUCTION = "https://api.push.apple.com";
const APNS_HOST_SANDBOX = "https://api.sandbox.push.apple.com";
/** APNs provider tokens are valid for an hour; re-sign well before that. */
const APNS_JWT_TTL_SECONDS = 50 * 60;

const FCM_APP_NAME = "push";

const DEAD_FCM_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

const DEAD_APNS_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
]);

// ---------------------------------------------------------------------------
// Pure builders and classifiers
// ---------------------------------------------------------------------------

export function buildFcmMessage(token: string, msg: PushMessage): object {
  return {
    token,
    notification: {
      title: msg.title,
      ...(msg.body !== undefined ? { body: msg.body } : {}),
    },
    data: msg.link !== undefined ? { link: msg.link } : {},
    android: {
      priority: "high",
      notification: { channelId: "default", icon: "ic_stat_notify" },
    },
  };
}

export function buildApnsPayload(msg: PushMessage): object {
  return {
    aps: {
      alert: {
        title: msg.title,
        ...(msg.body !== undefined ? { body: msg.body } : {}),
      },
      sound: "default",
    },
    ...(msg.link !== undefined ? { link: msg.link } : {}),
  };
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** Signs an APNs provider token (ES256). `keyP8` is the .p8 PEM, base64-encoded. */
export function apnsJwt(args: {
  keyP8: string;
  keyId: string;
  teamId: string;
  nowSeconds: number;
}): string {
  const h = base64url(JSON.stringify({ alg: "ES256", kid: args.keyId }));
  const p = base64url(JSON.stringify({ iss: args.teamId, iat: args.nowSeconds }));
  const pem = Buffer.from(args.keyP8, "base64").toString("utf8");
  const signature = crypto.sign("sha256", Buffer.from(`${h}.${p}`), {
    key: pem,
    dsaEncoding: "ieee-p1363",
  });
  return `${h}.${p}.${base64url(signature)}`;
}

export function isDeadFcmError(code: string | undefined): boolean {
  return code !== undefined && DEAD_FCM_CODES.has(code);
}

export function isDeadApnsResponse(status: number, reason: string | undefined): boolean {
  if (status === 410) return true;
  return status === 400 && reason !== undefined && DEAD_APNS_REASONS.has(reason);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

function transient(token: string): SendOutcome {
  return { token, ok: false, dead: false };
}

/** Error summary for logs: name, code and message only, never the raw object. */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const code = (err as { code?: unknown }).code;
  return `${err.name}${typeof code === "string" ? ` (${code})` : ""}: ${err.message}`;
}

/** Resolves with `onTimeout()` if `promise` has not settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const loggedOnce = new Set<string>();
function logOnce(level: "warn" | "error", message: string): void {
  if (loggedOnce.has(message)) return;
  loggedOnce.add(message);
  console[level](message);
}

// ---------------------------------------------------------------------------
// FCM transport (Android)
// ---------------------------------------------------------------------------

interface FcmClient {
  sendEach(
    messages: object[]
  ): Promise<{ responses: { success: boolean; error?: { code?: string } }[] }>;
}

let fcmClient: Promise<FcmClient | null> | undefined;

async function createFcmClient(serviceAccountB64: string): Promise<FcmClient | null> {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(serviceAccountB64, "base64").toString("utf8")
    );
    const { cert, getApps, initializeApp } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");
    const app =
      getApps().find((a) => a.name === FCM_APP_NAME) ??
      initializeApp({ credential: cert(serviceAccount) }, FCM_APP_NAME);
    const messaging = getMessaging(app);
    return {
      sendEach: (messages) =>
        messaging.sendEach(messages as Parameters<typeof messaging.sendEach>[0]),
    };
  } catch {
    // Deliberately not logging the error: it can quote the service account.
    logOnce("error", "[push] FCM configuration is invalid (FIREBASE_SERVICE_ACCOUNT_JSON)");
    return null;
  }
}

function sendFcm(tokens: string[], msg: PushMessage): Promise<SendOutcome[]> | null {
  const serviceAccountB64 = readEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountB64) {
    logOnce("warn", "[push] FCM not configured");
    return null;
  }
  fcmClient ??= createFcmClient(serviceAccountB64);
  return fcmClient.then(async (client) => {
    if (!client) return tokens.map(transient);
    const { responses } = await client.sendEach(tokens.map((t) => buildFcmMessage(t, msg)));
    return tokens.map((token, i): SendOutcome => {
      const r = responses[i];
      if (r?.success) return { token, ok: true };
      return { token, ok: false, dead: isDeadFcmError(r?.error?.code) };
    });
  });
}

// ---------------------------------------------------------------------------
// APNs transport (iOS)
// ---------------------------------------------------------------------------

interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
}

let cachedApnsJwt: { jwt: string; iat: number } | undefined;

function currentApnsJwt(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (!cachedApnsJwt || now - cachedApnsJwt.iat >= APNS_JWT_TTL_SECONDS) {
    cachedApnsJwt = { jwt: apnsJwt({ ...config, nowSeconds: now }), iat: now };
  }
  return cachedApnsJwt.jwt;
}

function sendOneApns(
  session: http2.ClientHttp2Session,
  jwt: string,
  token: string,
  body: string
): Promise<SendOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: SendOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    let status = 0;
    let raw = "";

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${encodeURIComponent(token)}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk: string) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (status === 200) return finish({ token, ok: true });
      let reason: string | undefined;
      try {
        const parsed = JSON.parse(raw) as { reason?: unknown };
        if (typeof parsed.reason === "string") reason = parsed.reason;
      } catch {
        // Empty or non-JSON body: classify on status alone.
      }
      finish({ token, ok: false, dead: isDeadApnsResponse(status, reason) });
    });
    // A stream that errors or closes without a full response is transient.
    req.on("error", () => finish(transient(token)));
    req.on("close", () => finish(transient(token)));
    req.end(body);
  });
}

function sendApnsBatch(
  config: ApnsConfig,
  tokens: string[],
  msg: PushMessage
): Promise<SendOutcome[]> {
  let jwt: string;
  try {
    jwt = currentApnsJwt(config);
  } catch {
    // Deliberately not logging the error: it concerns the signing key.
    logOnce("error", "[push] APNs key could not sign a token (APNS_KEY_P8)");
    return Promise.resolve(tokens.map(transient));
  }

  const host = process.env.APNS_PRODUCTION === "1" ? APNS_HOST_PRODUCTION : APNS_HOST_SANDBOX;
  const body = JSON.stringify(buildApnsPayload(msg));
  const session = http2.connect(host);
  session.on("error", (err) => {
    console.error("[push] APNs connection error:", describeError(err));
  });

  const batch = Promise.all(tokens.map((token) => sendOneApns(session, jwt, token, body)));
  return withTimeout(batch, PUSH_TIMEOUT_MS, () => {
    console.error("[push] APNs batch timed out");
    return tokens.map(transient);
  }).finally(() => {
    // Every stream has finished or been abandoned by the timeout; destroying
    // the session also tears down any stream still hanging.
    session.destroy();
  });
}

function sendApns(tokens: string[], msg: PushMessage): Promise<SendOutcome[]> | null {
  const keyP8 = readEnv("APNS_KEY_P8");
  const keyId = readEnv("APNS_KEY_ID");
  const teamId = readEnv("APPLE_TEAM_ID");
  if (!keyP8 || !keyId || !teamId) {
    logOnce("warn", "[push] APNs not configured");
    return null;
  }
  return sendApnsBatch({ keyP8, keyId, teamId }, tokens, msg);
}

const defaultTransports: PushTransports = { sendFcm, sendApns };

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Runs one transport, bounded by PUSH_TIMEOUT_MS. Never rejects: an
 * unconfigured transport, a throw, or a timeout all yield no outcomes, so
 * nothing from that batch is pruned.
 */
async function runTransport(
  name: string,
  send: () => Promise<SendOutcome[]> | null
): Promise<SendOutcome[]> {
  try {
    const pending = send();
    if (!pending) return [];
    return await withTimeout(pending, PUSH_TIMEOUT_MS, () => {
      console.error(`[push] ${name} batch timed out`);
      return [];
    });
  } catch (err) {
    console.error(`[push] ${name} send failed:`, describeError(err));
    return [];
  }
}

/**
 * Sends `msg` to every registered device of `userId` and prunes tokens the
 * providers report as dead. Never rejects, and each transport batch is bounded
 * to 10 seconds.
 */
export async function sendPushToUser(
  userId: string,
  msg: PushMessage,
  transports: PushTransports = defaultTransports
): Promise<void> {
  try {
    const devices = await listDevices(userId);
    if (devices.length === 0) return;

    const android = devices.filter((d) => d.platform === "ANDROID").map((d) => d.token);
    const ios = devices.filter((d) => d.platform === "IOS").map((d) => d.token);

    const [fcmOutcomes, apnsOutcomes] = await Promise.all([
      android.length > 0 ? runTransport("FCM", () => transports.sendFcm(android, msg)) : [],
      ios.length > 0 ? runTransport("APNs", () => transports.sendApns(ios, msg)) : [],
    ]);

    const dead = [...fcmOutcomes, ...apnsOutcomes]
      .filter((o) => !o.ok && o.dead)
      .map((o) => o.token);
    if (dead.length > 0) await removeTokens(dead);
  } catch (err) {
    console.error("[push] delivery failed:", describeError(err));
  }
}
