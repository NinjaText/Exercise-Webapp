import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "../route";

const ENV_KEYS = [
  "MOBILE_MIN_VERSION_IOS",
  "MOBILE_MIN_VERSION_ANDROID",
  "NEXT_PUBLIC_IOS_STORE_URL",
  "NEXT_PUBLIC_ANDROID_STORE_URL",
] as const;

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("GET /api/mobile/config", () => {
  it("defaults to 1.0.0 minimums and null store URLs when env is unset", async () => {
    const res = GET();
    const body = await res.json();
    expect(body).toEqual({
      minSupportedVersion: { ios: "1.0.0", android: "1.0.0" },
      storeUrls: { ios: null, android: null },
    });
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("returns configured values when env is set", async () => {
    process.env.MOBILE_MIN_VERSION_IOS = "1.4.0";
    process.env.MOBILE_MIN_VERSION_ANDROID = "1.3.0";
    process.env.NEXT_PUBLIC_IOS_STORE_URL = "https://apps.apple.com/app/id1";
    process.env.NEXT_PUBLIC_ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.goinmotus.app";

    const res = GET();
    const body = await res.json();
    expect(body).toEqual({
      minSupportedVersion: { ios: "1.4.0", android: "1.3.0" },
      storeUrls: {
        ios: "https://apps.apple.com/app/id1",
        android: "https://play.google.com/store/apps/details?id=com.goinmotus.app",
      },
    });
  });

  it("falls back to defaults for blank/whitespace-only env values", async () => {
    process.env.MOBILE_MIN_VERSION_IOS = "   ";
    process.env.NEXT_PUBLIC_IOS_STORE_URL = "";

    const res = GET();
    const body = await res.json();
    expect(body.minSupportedVersion.ios).toBe("1.0.0");
    expect(body.storeUrls.ios).toBeNull();
  });
});
