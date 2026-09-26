import crypto from "node:crypto";
import http2 from "node:http2";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// Network seams for the default transports: a scripted HTTP/2 client for APNs
// and a fake firebase-admin whose sendEach returns scripted responses.
const h2 = vi.hoisted(() => ({
  requests: [] as { headers: Record<string, string>; body: string }[],
  responses: [] as { status: number; body?: string }[],
}));

vi.mock("node:http2", async () => {
  const { EventEmitter } = await import("node:events");
  const connect = vi.fn(() => {
    const session = Object.assign(new EventEmitter(), {
      destroy: vi.fn(),
      request: (headers: Record<string, string>) => {
        const stream = Object.assign(new EventEmitter(), {
          setEncoding: () => {},
          end: (body: string) => {
            h2.requests.push({ headers, body });
            const r = h2.responses.shift() ?? { status: 200 };
            void Promise.resolve().then(() => {
              stream.emit("response", { ":status": r.status });
              if (r.body) stream.emit("data", r.body);
              stream.emit("end");
              stream.emit("close");
            });
          },
        });
        return stream;
      },
    });
    return session;
  });
  return { default: { connect }, connect };
});

const fcm = vi.hoisted(() => ({ sendEach: vi.fn() }));

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn((serviceAccount: unknown) => serviceAccount),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: "push" })),
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => ({ sendEach: fcm.sendEach })),
}));

vi.mock("@/lib/services/push-device.service", () => ({
  listDevices: vi.fn(),
  removeTokens: vi.fn(),
}));

import { listDevices, removeTokens } from "@/lib/services/push-device.service";
import {
  buildFcmMessage,
  buildApnsPayload,
  apnsJwt,
  isDeadFcmError,
  isDeadApnsResponse,
  sendPushToUser,
  resetPushCachesForTests,
  type PushMessage,
  type PushTransports,
  type SendOutcome,
} from "../push.service";

const mockListDevices = vi.mocked(listDevices);
const mockRemoveTokens = vi.mocked(removeTokens);

function b64urlDecode(part: string): string {
  return Buffer.from(part, "base64url").toString("utf8");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Module-level caches (APNs JWT, FCM client, once-only logs) would otherwise
  // leak between tests and make them order-dependent.
  resetPushCachesForTests();
  mockRemoveTokens.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildFcmMessage", () => {
  it("builds a high-priority Android notification with the link in data", () => {
    expect(
      buildFcmMessage("t", { title: "Hi", body: "B", link: "/messages/1" })
    ).toEqual({
      token: "t",
      notification: { title: "Hi", body: "B" },
      data: { link: "/messages/1" },
      android: {
        priority: "high",
        notification: { channelId: "default", icon: "ic_stat_notify" },
      },
    });
  });

  it("uses empty data when there is no link", () => {
    const m = buildFcmMessage("t", { title: "Hi", body: "B" }) as {
      data: Record<string, string>;
    };
    expect(m.data).toEqual({});
  });

  it("omits notification.body when there is no body", () => {
    const m = buildFcmMessage("t", { title: "Hi" }) as {
      notification: Record<string, string>;
    };
    expect(m.notification).toEqual({ title: "Hi" });
    expect("body" in m.notification).toBe(false);
  });
});

describe("buildApnsPayload", () => {
  it("builds an alert with sound and a top-level link", () => {
    expect(buildApnsPayload({ title: "Hi", body: "B", link: "/x" })).toEqual({
      aps: { alert: { title: "Hi", body: "B" }, sound: "default" },
      link: "/x",
    });
  });

  it("omits body and link when absent", () => {
    expect(buildApnsPayload({ title: "Hi" })).toEqual({
      aps: { alert: { title: "Hi" }, sound: "default" },
    });
  });
});

describe("apnsJwt", () => {
  it("produces an ES256 JWT that verifies with the matching public key", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const keyP8 = Buffer.from(pem, "utf8").toString("base64");

    const jwt = apnsJwt({
      keyP8,
      keyId: "KEY123",
      teamId: "TEAM456",
      nowSeconds: 1_700_000_000,
    });

    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(b64urlDecode(h))).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(b64urlDecode(p))).toEqual({
      iss: "TEAM456",
      iat: 1_700_000_000,
    });
    const verified = crypto.verify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url")
    );
    expect(verified).toBe(true);
  });
});

describe("isDeadFcmError", () => {
  it.each([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ])("treats %s as dead", (code) => {
    expect(isDeadFcmError(code)).toBe(true);
  });

  it("treats internal errors, payload errors and missing codes as transient", () => {
    expect(isDeadFcmError("messaging/internal-error")).toBe(false);
    // Also returned for a malformed payload, so it must not prune tokens.
    expect(isDeadFcmError("messaging/invalid-argument")).toBe(false);
    expect(isDeadFcmError(undefined)).toBe(false);
  });
});

describe("isDeadApnsResponse", () => {
  it("treats 410 as dead", () => {
    expect(isDeadApnsResponse(410, "Unregistered")).toBe(true);
    expect(isDeadApnsResponse(410, undefined)).toBe(true);
  });

  it("treats 400 BadDeviceToken / DeviceTokenNotForTopic as dead", () => {
    expect(isDeadApnsResponse(400, "BadDeviceToken")).toBe(true);
    expect(isDeadApnsResponse(400, "DeviceTokenNotForTopic")).toBe(true);
  });

  it("treats success, throttling, server errors and other 400s as not dead", () => {
    expect(isDeadApnsResponse(200, undefined)).toBe(false);
    expect(isDeadApnsResponse(429, "TooManyRequests")).toBe(false);
    expect(isDeadApnsResponse(500, "InternalServerError")).toBe(false);
    expect(isDeadApnsResponse(400, "PayloadTooLarge")).toBe(false);
  });
});

describe("sendPushToUser", () => {
  const msg: PushMessage = { title: "Hi", body: "B", link: "/x" };

  function fakeTransports(overrides: Partial<PushTransports> = {}) {
    const sendFcm = vi.fn(
      (tokens: string[]): Promise<SendOutcome[]> | null =>
        Promise.resolve(tokens.map((token) => ({ token, ok: true as const })))
    );
    const sendApns = vi.fn(
      (tokens: string[]): Promise<SendOutcome[]> | null =>
        Promise.resolve(tokens.map((token) => ({ token, ok: true as const })))
    );
    return { sendFcm, sendApns, ...overrides } as {
      sendFcm: typeof sendFcm;
      sendApns: typeof sendApns;
    };
  }

  it("does nothing when the user has no devices", async () => {
    mockListDevices.mockResolvedValue([]);
    const t = fakeTransports();

    await sendPushToUser("u1", msg, t);

    expect(t.sendFcm).not.toHaveBeenCalled();
    expect(t.sendApns).not.toHaveBeenCalled();
    expect(mockRemoveTokens).not.toHaveBeenCalled();
  });

  it("routes Android tokens to FCM and iOS tokens to APNs", async () => {
    mockListDevices.mockResolvedValue([
      { token: "a1", platform: "ANDROID" },
      { token: "i1", platform: "IOS" },
      { token: "a2", platform: "ANDROID" },
    ]);
    const t = fakeTransports();

    await sendPushToUser("u1", msg, t);

    expect(mockListDevices).toHaveBeenCalledWith("u1");
    expect(t.sendFcm).toHaveBeenCalledWith(["a1", "a2"], msg);
    expect(t.sendApns).toHaveBeenCalledWith(["i1"], msg);
  });

  it("skips a platform with no tokens", async () => {
    mockListDevices.mockResolvedValue([{ token: "i1", platform: "IOS" }]);
    const t = fakeTransports();

    await sendPushToUser("u1", msg, t);

    expect(t.sendFcm).not.toHaveBeenCalled();
    expect(t.sendApns).toHaveBeenCalledWith(["i1"], msg);
  });

  it("prunes only dead tokens, not live or transient failures", async () => {
    mockListDevices.mockResolvedValue([
      { token: "a-live", platform: "ANDROID" },
      { token: "a-dead", platform: "ANDROID" },
      { token: "i-transient", platform: "IOS" },
      { token: "i-dead", platform: "IOS" },
    ]);
    const t = fakeTransports({
      sendFcm: vi.fn(async () => [
        { token: "a-live", ok: true as const },
        { token: "a-dead", ok: false as const, dead: true },
      ]),
      sendApns: vi.fn(async () => [
        { token: "i-transient", ok: false as const, dead: false },
        { token: "i-dead", ok: false as const, dead: true },
      ]),
    });

    await sendPushToUser("u1", msg, t);

    expect(mockRemoveTokens).toHaveBeenCalledTimes(1);
    expect(mockRemoveTokens.mock.calls[0][0].sort()).toEqual(["a-dead", "i-dead"]);
  });

  it("skips an unconfigured transport (null) without error", async () => {
    mockListDevices.mockResolvedValue([
      { token: "a1", platform: "ANDROID" },
      { token: "i-dead", platform: "IOS" },
    ]);
    const t = fakeTransports({
      sendFcm: vi.fn(() => null),
      sendApns: vi.fn(async () => [{ token: "i-dead", ok: false as const, dead: true }]),
    });

    await expect(sendPushToUser("u1", msg, t)).resolves.toBeUndefined();
    expect(mockRemoveTokens).toHaveBeenCalledWith(["i-dead"]);
  });

  it("does not throw or prune when a transport throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockListDevices.mockResolvedValue([
      { token: "a1", platform: "ANDROID" },
      { token: "i1", platform: "IOS" },
    ]);
    const t = fakeTransports({
      sendFcm: vi.fn(() => {
        throw new Error("sync boom");
      }),
      sendApns: vi.fn(async () => {
        throw new Error("async boom");
      }),
    });

    await expect(sendPushToUser("u1", msg, t)).resolves.toBeUndefined();
    expect(mockRemoveTokens).not.toHaveBeenCalled();
  });

  it("still prunes the other platform's dead tokens when one transport throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockListDevices.mockResolvedValue([
      { token: "a1", platform: "ANDROID" },
      { token: "i-dead", platform: "IOS" },
    ]);
    const t = fakeTransports({
      sendFcm: vi.fn(async () => {
        throw new Error("boom");
      }),
      sendApns: vi.fn(async () => [{ token: "i-dead", ok: false as const, dead: true }]),
    });

    await sendPushToUser("u1", msg, t);

    expect(mockRemoveTokens).toHaveBeenCalledWith(["i-dead"]);
  });

  it("does not throw when listing devices fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockListDevices.mockRejectedValue(new Error("db down"));

    await expect(sendPushToUser("u1", msg, fakeTransports())).resolves.toBeUndefined();
  });

  it("does not throw when pruning fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockListDevices.mockResolvedValue([{ token: "i-dead", platform: "IOS" }]);
    mockRemoveTokens.mockRejectedValue(new Error("db down"));
    const t = fakeTransports({
      sendApns: vi.fn(async () => [{ token: "i-dead", ok: false as const, dead: true }]),
    });

    await expect(sendPushToUser("u1", msg, t)).resolves.toBeUndefined();
  });

  it("resolves after the 10s timeout when a transport hangs, treating it as transient", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockListDevices.mockResolvedValue([
      { token: "a1", platform: "ANDROID" },
      { token: "i-dead", platform: "IOS" },
    ]);
    const t = fakeTransports({
      sendFcm: vi.fn(() => new Promise<SendOutcome[]>(() => {})),
      sendApns: vi.fn(async () => [{ token: "i-dead", ok: false as const, dead: true }]),
    });

    let settled = false;
    const done = sendPushToUser("u1", msg, t).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(settled).toBe(true);
    // The hung FCM batch is transient (a1 kept); APNs' dead token is still pruned.
    expect(mockRemoveTokens).toHaveBeenCalledWith(["i-dead"]);
  });

  it("with default transports and no push env configured, skips delivery without error", async () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("APNS_KEY_P8", "");
    vi.stubEnv("APNS_KEY_ID", "");
    vi.stubEnv("APPLE_TEAM_ID", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockListDevices.mockResolvedValue([
      { token: "a1", platform: "ANDROID" },
      { token: "i1", platform: "IOS" },
    ]);

    await expect(sendPushToUser("u1", msg)).resolves.toBeUndefined();
    expect(mockRemoveTokens).not.toHaveBeenCalled();
  });
});

describe("default FCM transport", () => {
  it("maps mixed sendEach responses to outcomes by index", async () => {
    vi.stubEnv(
      "FIREBASE_SERVICE_ACCOUNT_JSON",
      Buffer.from(JSON.stringify({ project_id: "p" })).toString("base64")
    );
    mockListDevices.mockResolvedValue([
      { token: "a-ok", platform: "ANDROID" },
      { token: "a-dead", platform: "ANDROID" },
      { token: "a-transient", platform: "ANDROID" },
      { token: "a-missing", platform: "ANDROID" },
    ]);
    fcm.sendEach.mockResolvedValue({
      responses: [
        { success: true, messageId: "m1" },
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: false, error: { code: "messaging/internal-error" } },
        // No 4th response: treated as transient.
      ],
    });
    const msg: PushMessage = { title: "Hi", link: "/x" };

    await sendPushToUser("u1", msg);

    expect(fcm.sendEach).toHaveBeenCalledWith(
      ["a-ok", "a-dead", "a-transient", "a-missing"].map((t) => buildFcmMessage(t, msg))
    );
    expect(mockRemoveTokens).toHaveBeenCalledWith(["a-dead"]);
  });
});

describe("default APNs transport", () => {
  function configureApns() {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    vi.stubEnv("APNS_KEY_P8", Buffer.from(pem).toString("base64"));
    vi.stubEnv("APNS_KEY_ID", "KEY123");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM456");
  }

  beforeEach(() => {
    h2.requests.length = 0;
    h2.responses.length = 0;
  });

  it("posts to /3/device/<token> and prunes only dead responses", async () => {
    configureApns();
    mockListDevices.mockResolvedValue([
      { token: "i-ok", platform: "IOS" },
      { token: "i-gone", platform: "IOS" },
      { token: "i-bad", platform: "IOS" },
      { token: "i-throttled", platform: "IOS" },
    ]);
    h2.responses.push(
      { status: 200 },
      { status: 410, body: JSON.stringify({ reason: "Unregistered" }) },
      { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) },
      { status: 429, body: JSON.stringify({ reason: "TooManyRequests" }) }
    );
    const msg: PushMessage = { title: "Hi", body: "B", link: "/x" };

    await sendPushToUser("u1", msg);

    expect(h2.requests[0].headers).toMatchObject({
      ":method": "POST",
      ":path": "/3/device/i-ok",
      "apns-topic": "com.goinmotus.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    expect(h2.requests[0].headers.authorization).toMatch(/^bearer [^.]+\.[^.]+\.[^.]+$/);
    expect(h2.requests[0].body).toBe(JSON.stringify(buildApnsPayload(msg)));
    expect(mockRemoveTokens).toHaveBeenCalledWith(["i-gone", "i-bad"]);
  });

  it("sends to the production APNs host by default", async () => {
    configureApns();
    mockListDevices.mockResolvedValue([{ token: "i1", platform: "IOS" }]);

    await sendPushToUser("u1", { title: "Hi" });

    expect(vi.mocked(http2.connect)).toHaveBeenCalledWith("https://api.push.apple.com");
  });

  it("sends to the sandbox host only when APNS_SANDBOX is 1", async () => {
    configureApns();
    mockListDevices.mockResolvedValue([{ token: "i1", platform: "IOS" }]);

    vi.stubEnv("APNS_SANDBOX", "1");
    await sendPushToUser("u1", { title: "Hi" });
    vi.stubEnv("APNS_SANDBOX", "true");
    await sendPushToUser("u1", { title: "Hi" });

    expect(vi.mocked(http2.connect).mock.calls.map((c) => c[0])).toEqual([
      "https://api.sandbox.push.apple.com",
      "https://api.push.apple.com",
    ]);
  });

  it("warns once about a BadDeviceToken on the sandbox, and still prunes", async () => {
    configureApns();
    vi.stubEnv("APNS_SANDBOX", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockListDevices.mockResolvedValue([
      { token: "i-bad-1", platform: "IOS" },
      { token: "i-bad-2", platform: "IOS" },
    ]);
    h2.responses.push(
      { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) },
      { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) }
    );

    await sendPushToUser("u1", { title: "Hi" });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[push] BadDeviceToken on the APNs sandbox — is APNS_SANDBOX set for a production build?"
    );
    expect(mockRemoveTokens).toHaveBeenCalledWith(["i-bad-1", "i-bad-2"]);
  });

  it("does not warn about a BadDeviceToken on the production host", async () => {
    configureApns();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockListDevices.mockResolvedValue([{ token: "i-bad", platform: "IOS" }]);
    h2.responses.push({ status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) });

    await sendPushToUser("u1", { title: "Hi" });

    expect(warn).not.toHaveBeenCalled();
    expect(mockRemoveTokens).toHaveBeenCalledWith(["i-bad"]);
  });

  it("reuses the cached JWT, and re-signs after a 403 ExpiredProviderToken", async () => {
    configureApns();
    mockListDevices.mockResolvedValue([{ token: "i1", platform: "IOS" }]);
    const msg: PushMessage = { title: "Hi" };
    h2.responses.push(
      { status: 200 },
      { status: 200 },
      { status: 403, body: JSON.stringify({ reason: "ExpiredProviderToken" }) },
      { status: 200 }
    );

    for (let i = 0; i < 4; i++) await sendPushToUser("u1", msg);

    const auth = h2.requests.map((r) => r.headers.authorization);
    expect(auth[1]).toBe(auth[0]);
    expect(auth[2]).toBe(auth[1]);
    // ES256 signatures are randomised, so a fresh signature differs even within the same second.
    expect(auth[3]).not.toBe(auth[2]);
    expect(mockRemoveTokens).not.toHaveBeenCalled();
  });
});
