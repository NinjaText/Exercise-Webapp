import { describe, it, expect, vi, afterEach } from "vitest";
import { withLiveReadDeadline } from "../live-read";

describe("withLiveReadDeadline", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the result when Stripe answers in time", async () => {
    await expect(withLiveReadDeadline(Promise.resolve("acct"), 50)).resolves.toBe("acct");
  });

  it("rejects at the deadline when the request never settles (unreachable API)", async () => {
    vi.useFakeTimers();
    const hung = new Promise<string>(() => undefined);
    const result = withLiveReadDeadline(hung, 8_000);
    vi.advanceTimersByTime(8_000);
    await expect(result).rejects.toThrow("Stripe did not respond within 8000ms");
  });

  it("passes through a Stripe error that arrives before the deadline", async () => {
    await expect(withLiveReadDeadline(Promise.reject(new Error("card_error")), 50)).rejects.toThrow("card_error");
  });
});
