import { describe, it, expect, vi } from "vitest";
import {
  RESUME_REFRESH_AFTER_MS,
  decideBackAction,
  registerNativeLifecycle,
  shouldOpenExternally,
  shouldRefreshOnResume,
  type LifecycleDeps,
} from "../lifecycle";

describe("shouldRefreshOnResume", () => {
  const t0 = 1_000_000;
  it("refreshes after the threshold", () => {
    expect(shouldRefreshOnResume(t0, t0 + RESUME_REFRESH_AFTER_MS + 1)).toBe(true);
  });
  it("refreshes exactly at the threshold", () => {
    expect(shouldRefreshOnResume(t0, t0 + RESUME_REFRESH_AFTER_MS)).toBe(true);
  });
  it("does not refresh after a short pause, so half-typed input survives", () => {
    expect(shouldRefreshOnResume(t0, t0 + 30_000)).toBe(false);
  });
  it("does not refresh when no pause was recorded", () => {
    expect(shouldRefreshOnResume(null, t0)).toBe(false);
  });
});

describe("decideBackAction", () => {
  it("goes back when there is history", () => expect(decideBackAction(true)).toBe("back"));
  it("minimises at the root instead of exiting to a blank view", () => expect(decideBackAction(false)).toBe("minimize"));
});

describe("shouldOpenExternally", () => {
  const origin = "https://app.goinmotus.com";
  it("keeps same-origin absolute and relative links in the app", () => {
    expect(shouldOpenExternally("https://app.goinmotus.com/clients/1", origin)).toBe(false);
    expect(shouldOpenExternally("/programs", origin)).toBe(false);
    expect(shouldOpenExternally("?tab=2", origin)).toBe(false);
  });
  it("opens other origins in the system browser", () => {
    expect(shouldOpenExternally("https://www.youtube.com/watch?v=x", origin)).toBe(true);
    expect(shouldOpenExternally("https://checkout.stripe.com/pay/1", origin)).toBe(true);
  });
  it("treats a look-alike host as external", () => {
    expect(shouldOpenExternally("https://app.goinmotus.com.evil.io/", origin)).toBe(true);
  });
  it("leaves mailto, tel and unparseable hrefs to the platform", () => {
    expect(shouldOpenExternally("mailto:support@goinmotus.com", origin)).toBe(false);
    expect(shouldOpenExternally("tel:+15551234", origin)).toBe(false);
    expect(shouldOpenExternally("http://[bad", origin)).toBe(false);
  });
});

function makeDeps() {
  const handlers: Record<string, (arg: never) => void> = {};
  const removed: string[] = [];
  const listen = (name: string) => (event: string, fn: (arg: never) => void) => {
    handlers[`${name}:${event}`] = fn;
    return Promise.resolve({ remove: () => { removed.push(`${name}:${event}`); return Promise.resolve(); } });
  };
  let clickHandler: ((e: unknown) => void) | undefined;
  const deps: LifecycleDeps = {
    app: {
      addListener: listen("app") as unknown as LifecycleDeps["app"]["addListener"],
      minimizeApp: vi.fn(() => Promise.resolve()),
      getInfo: vi.fn(() => Promise.resolve({ version: "1.2.3" })),
    },
    network: {
      addListener: listen("network") as unknown as LifecycleDeps["network"]["addListener"],
      getStatus: vi.fn(() => Promise.resolve({ connected: false })),
    },
    splash: { hide: vi.fn(() => Promise.resolve()) },
    statusBar: { setStyle: vi.fn(() => Promise.resolve()) },
    browser: { open: vi.fn(() => Promise.resolve()) },
    doc: {
      addEventListener: ((_t: string, fn: (e: unknown) => void) => {
        clickHandler = fn;
      }) as unknown as LifecycleDeps["doc"]["addEventListener"],
      removeEventListener: vi.fn(),
    },
    origin: "https://app.goinmotus.com",
    now: vi.fn(() => 0),
    historyBack: vi.fn(),
    onOnlineChange: vi.fn(),
    onAppVersion: vi.fn(),
    onResumeAfterLongPause: vi.fn(),
  };
  return { deps, handlers, removed, click: (e: unknown) => clickHandler?.(e) };
}

describe("registerNativeLifecycle", () => {
  it("hides the splash, sets the status bar, reports version and connectivity", async () => {
    const { deps } = makeDeps();
    await registerNativeLifecycle(deps);
    expect(deps.splash.hide).toHaveBeenCalled();
    expect(deps.statusBar.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(deps.onAppVersion).toHaveBeenCalledWith("1.2.3");
    expect(deps.onOnlineChange).toHaveBeenCalledWith(false);
  });

  it("routes the Android back button", async () => {
    const { deps, handlers } = makeDeps();
    await registerNativeLifecycle(deps);
    handlers["app:backButton"]({ canGoBack: true } as never);
    expect(deps.historyBack).toHaveBeenCalled();
    handlers["app:backButton"]({ canGoBack: false } as never);
    expect(deps.app.minimizeApp).toHaveBeenCalled();
  });

  it("refreshes only after a long background, while online", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.network.getStatus).mockResolvedValue({ connected: true });
    await registerNativeLifecycle(deps);
    vi.mocked(deps.now).mockReturnValue(0);
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(10_000);
    handlers["app:appStateChange"]({ isActive: true } as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.onResumeAfterLongPause).not.toHaveBeenCalled();
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(10_000 + RESUME_REFRESH_AFTER_MS);
    handlers["app:appStateChange"]({ isActive: true } as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.onResumeAfterLongPause).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when resuming after a long pause while offline", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.network.getStatus).mockResolvedValue({ connected: false });
    await registerNativeLifecycle(deps);
    vi.mocked(deps.now).mockReturnValue(0);
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(RESUME_REFRESH_AFTER_MS);
    handlers["app:appStateChange"]({ isActive: true } as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.onResumeAfterLongPause).not.toHaveBeenCalled();
  });

  it("refreshes exactly once when connectivity returns after an offline resume", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.network.getStatus).mockResolvedValue({ connected: false });
    await registerNativeLifecycle(deps);
    vi.mocked(deps.now).mockReturnValue(0);
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(RESUME_REFRESH_AFTER_MS);
    handlers["app:appStateChange"]({ isActive: true } as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.onResumeAfterLongPause).not.toHaveBeenCalled();
    handlers["network:networkStatusChange"]({ connected: true } as never);
    expect(deps.onResumeAfterLongPause).toHaveBeenCalledTimes(1);
    // Only the first connected transition after the pause consumes the debt.
    handlers["network:networkStatusChange"]({ connected: true } as never);
    expect(deps.onResumeAfterLongPause).toHaveBeenCalledTimes(1);
  });

  it("treats a rejected getStatus as offline and does not refresh", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.network.getStatus).mockRejectedValue(new Error("no network"));
    await registerNativeLifecycle(deps);
    vi.mocked(deps.now).mockReturnValue(0);
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(RESUME_REFRESH_AFTER_MS);
    handlers["app:appStateChange"]({ isActive: true } as never);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.onResumeAfterLongPause).not.toHaveBeenCalled();
  });

  it("forwards connectivity changes", async () => {
    const { deps, handlers } = makeDeps();
    await registerNativeLifecycle(deps);
    handlers["network:networkStatusChange"]({ connected: true } as never);
    expect(deps.onOnlineChange).toHaveBeenLastCalledWith(true);
  });

  it("opens external links in the system browser and leaves internal ones alone", async () => {
    const { deps, click } = makeDeps();
    await registerNativeLifecycle(deps);
    const external = { preventDefault: vi.fn(), defaultPrevented: false, target: { closest: () => ({ getAttribute: () => "https://youtube.com/x" }) } };
    click(external);
    expect(external.preventDefault).toHaveBeenCalled();
    expect(deps.browser.open).toHaveBeenCalledWith({ url: "https://youtube.com/x" });
    const internal = { preventDefault: vi.fn(), defaultPrevented: false, target: { closest: () => ({ getAttribute: () => "/clients" }) } };
    click(internal);
    expect(internal.preventDefault).not.toHaveBeenCalled();
  });

  it("removes every listener on cleanup", async () => {
    const { deps, removed } = makeDeps();
    const cleanup = await registerNativeLifecycle(deps);
    cleanup();
    await Promise.resolve();
    expect(removed.sort()).toEqual(["app:appStateChange", "app:backButton", "network:networkStatusChange"]);
    expect(deps.doc.removeEventListener).toHaveBeenCalled();
  });

  it("keeps working when a plugin call rejects", async () => {
    const { deps } = makeDeps();
    vi.mocked(deps.splash.hide).mockRejectedValue(new Error("no splash"));
    vi.mocked(deps.app.getInfo).mockRejectedValue(new Error("no info"));
    await expect(registerNativeLifecycle(deps)).resolves.toBeTypeOf("function");
  });
});
