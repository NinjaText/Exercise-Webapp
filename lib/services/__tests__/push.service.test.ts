import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

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
    "messaging/invalid-argument",
  ])("treats %s as dead", (code) => {
    expect(isDeadFcmError(code)).toBe(true);
  });

  it("treats internal errors and missing codes as transient", () => {
    expect(isDeadFcmError("messaging/internal-error")).toBe(false);
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
