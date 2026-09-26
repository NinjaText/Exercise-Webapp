import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfflineBanner } from "../offline-banner";

describe("OfflineBanner", () => {
  it("renders nothing while online, which is the default context", () => {
    expect(renderToStaticMarkup(<OfflineBanner />)).toBe("");
  });

  // OfflineBanner reads useNative() directly (no exported context value to wrap
  // with), so the offline case is exercised by mocking the hook module for just
  // this test (vi.doMock is unhoisted, unlike vi.mock, so the test above keeps
  // using the real hook and its "online by default" behaviour).
  it("renders the status strip above page chrome and modals, pinned to z-[60], while offline", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/use-native", () => ({ useNative: () => ({ isOnline: false }) }));
    const { OfflineBanner: OfflineBannerWhenOffline } = await import("../offline-banner");
    const html = renderToStaticMarkup(<OfflineBannerWhenOffline />);
    expect(html).toContain('role="status"');
    expect(html).toContain("No internet connection");
    expect(html).toContain("z-[60]");
    vi.doUnmock("@/hooks/use-native");
  });
});
