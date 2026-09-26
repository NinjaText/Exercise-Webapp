import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushDevice: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  registerDevice,
  unregisterToken,
  listDevices,
  removeTokens,
  isValidPushToken,
} from "../push-device.service";

const p = prisma as unknown as {
  pushDevice: {
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerDevice", () => {
  it("upserts by token, reassigning an existing token to the new user", async () => {
    await registerDevice({
      userId: "u1",
      token: "tok_abc",
      platform: "ios",
      appVersion: "1.2.0",
    });

    expect(p.pushDevice.upsert).toHaveBeenCalledWith({
      where: { token: "tok_abc" },
      update: expect.objectContaining({
        userId: "u1",
        platform: "IOS",
        appVersion: "1.2.0",
        lastSeenAt: expect.any(Date),
      }),
      create: expect.objectContaining({
        userId: "u1",
        token: "tok_abc",
        platform: "IOS",
        appVersion: "1.2.0",
      }),
    });
  });

  it("maps android platform to the ANDROID enum value", async () => {
    await registerDevice({ userId: "u1", token: "tok_fcm", platform: "android" });

    const args = p.pushDevice.upsert.mock.calls[0][0];
    expect(args.update.platform).toBe("ANDROID");
    expect(args.create.platform).toBe("ANDROID");
  });

  it("defaults a missing appVersion to null", async () => {
    await registerDevice({ userId: "u1", token: "tok_abc", platform: "ios" });

    const args = p.pushDevice.upsert.mock.calls[0][0];
    expect(args.update.appVersion).toBeNull();
    expect(args.create.appVersion).toBeNull();
  });
});

describe("unregisterToken", () => {
  it("deletes by token alone when no userId is given", async () => {
    await unregisterToken("tok_abc");

    expect(p.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { token: "tok_abc" } });
  });

  it("scopes the delete to a userId when given", async () => {
    await unregisterToken("tok_abc", "u1");

    expect(p.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { token: "tok_abc", userId: "u1" },
    });
  });
});

describe("listDevices", () => {
  it("returns the token and platform for a user's devices", async () => {
    p.pushDevice.findMany.mockResolvedValue([
      { token: "tok_1", platform: "IOS" },
      { token: "tok_2", platform: "ANDROID" },
    ]);

    await expect(listDevices("u1")).resolves.toEqual([
      { token: "tok_1", platform: "IOS" },
      { token: "tok_2", platform: "ANDROID" },
    ]);
    expect(p.pushDevice.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { token: true, platform: true },
    });
  });
});

describe("removeTokens", () => {
  it("makes no query for an empty list", async () => {
    await removeTokens([]);

    expect(p.pushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes every token given", async () => {
    await removeTokens(["a", "b"]);

    expect(p.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ["a", "b"] } },
    });
  });
});

describe("isValidPushToken", () => {
  it("accepts a 64-char hex APNs-style token", () => {
    expect(isValidPushToken("a".repeat(64))).toBe(true);
  });

  it("accepts a 160-char FCM-style token containing : - and _", () => {
    const token = `${"a".repeat(142)}:-_${"b".repeat(15)}`;
    expect(token.length).toBe(160);
    expect(isValidPushToken(token)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidPushToken("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidPushToken(12345)).toBe(false);
    expect(isValidPushToken(null)).toBe(false);
    expect(isValidPushToken(undefined)).toBe(false);
    expect(isValidPushToken({})).toBe(false);
  });

  it("rejects a token containing whitespace", () => {
    expect(isValidPushToken("tok with space")).toBe(false);
  });

  it("rejects a token over 4096 chars", () => {
    expect(isValidPushToken("a".repeat(4097))).toBe(false);
  });

  it("accepts a token at exactly 4096 chars", () => {
    expect(isValidPushToken("a".repeat(4096))).toBe(true);
  });
});
