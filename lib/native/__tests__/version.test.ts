import { describe, it, expect, vi } from "vitest";
import { checkForRequiredUpdate, isVersionBelow, type MobileConfig } from "../version";

describe("isVersionBelow", () => {
  it("compares numerically, not lexically", () => {
    expect(isVersionBelow("1.9.0", "1.10.0")).toBe(true);
    expect(isVersionBelow("1.10.0", "1.9.0")).toBe(false);
    expect(isVersionBelow("1.2.3", "1.2.3")).toBe(false);
  });
  it("never blocks on missing or malformed input", () => {
    expect(isVersionBelow(undefined, "2.0.0")).toBe(false);
    expect(isVersionBelow("1.0.0", undefined)).toBe(false);
    expect(isVersionBelow("1.0.0", "two")).toBe(false);
    expect(isVersionBelow("0.0.0-debug", "9.0.0")).toBe(false);
  });
});

const config = (min: string): MobileConfig => ({
  minSupportedVersion: { ios: min, android: min },
  storeUrls: { ios: "https://apps.apple.com/app/id1", android: null },
});

describe("checkForRequiredUpdate", () => {
  it("requires an update below the minimum and returns the platform's store URL", async () => {
    await expect(checkForRequiredUpdate({ platform: "ios", appVersion: "1.0.0", fetchConfig: async () => config("1.1.0") }))
      .resolves.toEqual({ storeUrl: "https://apps.apple.com/app/id1" });
  });
  it("returns null at or above the minimum", async () => {
    await expect(checkForRequiredUpdate({ platform: "android", appVersion: "1.1.0", fetchConfig: async () => config("1.1.0") })).resolves.toBeNull();
  });
  it("returns null when the config cannot be fetched", async () => {
    await expect(checkForRequiredUpdate({ platform: "ios", appVersion: "1.0.0", fetchConfig: vi.fn(async () => { throw new Error("offline"); }) })).resolves.toBeNull();
  });
});
