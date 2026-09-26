import { describe, it, expect } from "vitest";
import { nativeLandingRedirect } from "../landing";

const IOS = "Mozilla/5.0 (iPhone) InmotusApp/1.0.0 (ios)";
const WEB = "Mozilla/5.0 (Macintosh) Safari/605.1.15";

describe("nativeLandingRedirect", () => {
  it("sends a signed-out native user from / to sign-in", () => {
    expect(nativeLandingRedirect("/", IOS, false)).toBe("/sign-in");
  });
  it("sends a signed-in native user from / to the dashboard", () => {
    expect(nativeLandingRedirect("/", IOS, true)).toBe("/dashboard");
  });
  it("leaves web visitors on the landing page", () => {
    expect(nativeLandingRedirect("/", WEB, false)).toBeNull();
    expect(nativeLandingRedirect("/", null, false)).toBeNull();
  });
  it("only applies to the root path", () => {
    expect(nativeLandingRedirect("/about", IOS, false)).toBeNull();
    expect(nativeLandingRedirect("/sign-in", IOS, false)).toBeNull();
  });
});
