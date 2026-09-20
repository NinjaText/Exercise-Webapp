import { describe, it, expect } from "vitest";
import { parseNativeUserAgent, resolveNativeInfo, WEB_INFO } from "../platform";

describe("parseNativeUserAgent", () => {
  it("returns web info for a normal browser UA", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
    expect(parseNativeUserAgent(ua)).toEqual(WEB_INFO);
  });

  it("returns web info for null or empty", () => {
    expect(parseNativeUserAgent(null)).toEqual(WEB_INFO);
    expect(parseNativeUserAgent("")).toEqual(WEB_INFO);
    expect(parseNativeUserAgent(undefined)).toEqual(WEB_INFO);
  });

  it("detects the iOS shell and its version", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 InmotusApp/1.2.0 (ios)";
    expect(parseNativeUserAgent(ua)).toEqual({ isNative: true, platform: "ios", appVersion: "1.2.0" });
  });

  it("detects the Android shell case-insensitively", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 inmotusapp/2.0.1 (ANDROID)";
    expect(parseNativeUserAgent(ua)).toEqual({ isNative: true, platform: "android", appVersion: "2.0.1" });
  });

  it("ignores a malformed marker", () => {
    expect(parseNativeUserAgent("Foo InmotusApp/1.2 (ios)")).toEqual(WEB_INFO);
    expect(parseNativeUserAgent("Foo InmotusApp/1.2.0 (windows)")).toEqual(WEB_INFO);
  });
});

describe("resolveNativeInfo", () => {
  it("trusts the Capacitor runtime platform first", () => {
    expect(resolveNativeInfo({ capacitorPlatform: "ios", allowOverride: false })).toEqual({ isNative: true, platform: "ios" });
    expect(resolveNativeInfo({ capacitorPlatform: "android", override: "off", allowOverride: true })).toEqual({ isNative: true, platform: "android" });
  });

  it("honors a dev override on web when allowed", () => {
    expect(resolveNativeInfo({ capacitorPlatform: "web", override: "ios", allowOverride: true }))
      .toEqual({ isNative: true, platform: "ios", appVersion: "0.0.0-debug" });
  });

  it("ignores the override when not allowed or invalid", () => {
    expect(resolveNativeInfo({ capacitorPlatform: "web", override: "ios", allowOverride: false })).toEqual(WEB_INFO);
    expect(resolveNativeInfo({ capacitorPlatform: "web", override: "windows", allowOverride: true })).toEqual(WEB_INFO);
    expect(resolveNativeInfo({ capacitorPlatform: "web", override: null, allowOverride: true })).toEqual(WEB_INFO);
  });
});
