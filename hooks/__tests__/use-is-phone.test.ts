import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PHONE_QUERY,
  getPhoneServerSnapshot,
  getPhoneSnapshot,
  subscribeToPhoneQuery,
} from "../use-is-phone";

function stubMatchMedia(matches: boolean) {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const matchMedia = vi.fn(() => ({ matches, addEventListener, removeEventListener }));
  vi.stubGlobal("window", { matchMedia });
  return { matchMedia, addEventListener, removeEventListener };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIsPhoneViewport helpers", () => {
  it("uses the below-sm phone query", () => {
    expect(PHONE_QUERY).toBe("(max-width: 639.98px)");
  });

  it("reports false on the server", () => {
    expect(getPhoneServerSnapshot()).toBe(false);
  });

  it("reports false when there is no window", () => {
    expect(getPhoneSnapshot()).toBe(false);
  });

  it("reads the media query on the client", () => {
    const { matchMedia } = stubMatchMedia(true);
    expect(getPhoneSnapshot()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(PHONE_QUERY);

    stubMatchMedia(false);
    expect(getPhoneSnapshot()).toBe(false);
  });

  it("adds and removes a change listener", () => {
    const { addEventListener, removeEventListener } = stubMatchMedia(false);
    const onChange = vi.fn();
    const unsubscribe = subscribeToPhoneQuery(onChange);
    expect(addEventListener).toHaveBeenCalledWith("change", onChange);
    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith("change", onChange);
  });

  it("subscribes to nothing when there is no window", () => {
    expect(() => subscribeToPhoneQuery(() => {})()).not.toThrow();
  });
});
