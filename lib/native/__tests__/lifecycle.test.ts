import { describe, it, expect, vi } from "vitest";
import {
  RESUME_REFRESH_AFTER_MS,
  LAST_DEEP_LINK_KEY,
  createLastHandledStore,
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

function memoryLastHandled(initial: string | null = null) {
  let value = initial;
  return { get: vi.fn(() => value), set: vi.fn((url: string) => { value = url; }) };
}

function makeDeps(lastHandled = memoryLastHandled()) {
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
      getLaunchUrl: vi.fn(() => Promise.resolve(undefined as { url: string } | undefined)),
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
    navigate: vi.fn(),
    lastHandled,
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

  it("does not refresh twice when an online resume already serviced an offline debt", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.network.getStatus).mockResolvedValue({ connected: false });
    await registerNativeLifecycle(deps);
    // Cycle 1: long pause, resume offline -> refresh owed.
    vi.mocked(deps.now).mockReturnValue(0);
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(RESUME_REFRESH_AFTER_MS);
    handlers["app:appStateChange"]({ isActive: true } as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.onResumeAfterLongPause).not.toHaveBeenCalled();
    // Cycle 2: long pause, resume online -> refresh #1 services the debt.
    vi.mocked(deps.network.getStatus).mockResolvedValue({ connected: true });
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(3 * RESUME_REFRESH_AFTER_MS);
    handlers["app:appStateChange"]({ isActive: true } as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.onResumeAfterLongPause).toHaveBeenCalledTimes(1);
    // A later connectivity event must not refresh again.
    handlers["network:networkStatusChange"]({ connected: true } as never);
    expect(deps.onResumeAfterLongPause).toHaveBeenCalledTimes(1);
  });

  it("navigates in-app when a universal link opens the app", async () => {
    const { deps, handlers } = makeDeps();
    await registerNativeLifecycle(deps);
    handlers["app:appUrlOpen"]({ url: "https://app.goinmotus.com/messages/abc?x=1" } as never);
    expect(deps.navigate).toHaveBeenCalledWith("/messages/abc?x=1");
    handlers["app:appUrlOpen"]({ url: "inmotus://clients/42" } as never);
    expect(deps.navigate).toHaveBeenLastCalledWith("/clients/42");
  });

  it("ignores an opened URL from a foreign host", async () => {
    const { deps, handlers } = makeDeps();
    await registerNativeLifecycle(deps);
    handlers["app:appUrlOpen"]({ url: "https://evil.example/dashboard" } as never);
    handlers["app:appUrlOpen"]({ url: "inmotus:////evil.com" } as never);
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it("navigates once to the launch URL on a cold start from a link", async () => {
    const { deps } = makeDeps();
    vi.mocked(deps.app.getLaunchUrl).mockResolvedValue({ url: "https://app.goinmotus.com/programs/7" });
    await registerNativeLifecycle(deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.navigate).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith("/programs/7");
  });

  it("does not navigate for a launch URL at the root, a foreign launch URL, or a rejected getLaunchUrl", async () => {
    for (const setup of [
      (d: LifecycleDeps) => vi.mocked(d.app.getLaunchUrl).mockResolvedValue({ url: "https://app.goinmotus.com/" }),
      (d: LifecycleDeps) => vi.mocked(d.app.getLaunchUrl).mockResolvedValue({ url: "https://evil.example/x" }),
      (d: LifecycleDeps) => vi.mocked(d.app.getLaunchUrl).mockRejectedValue(new Error("none")),
    ]) {
      const { deps } = makeDeps();
      setup(deps);
      await registerNativeLifecycle(deps);
      await Promise.resolve();
      await Promise.resolve();
      expect(deps.navigate).not.toHaveBeenCalled();
    }
  });

  it("navigates once when a cold-start link arrives as both a retained event and the launch URL", async () => {
    const url = "https://app.goinmotus.com/messages/abc";
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.app.getLaunchUrl).mockResolvedValue({ url });
    // iOS delivers the retained appUrlOpen as soon as the listener registers.
    const addListener = deps.app.addListener;
    deps.app.addListener = ((event: string, fn: (e: never) => void) => {
      const handle = (addListener as unknown as (e: string, f: (e: never) => void) => Promise<unknown>)(event, fn);
      if (event === "appUrlOpen") fn({ url } as never);
      return handle;
    }) as unknown as LifecycleDeps["app"]["addListener"];
    await registerNativeLifecycle(deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.navigate).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith("/messages/abc");
    // A second delivery of the same event is ignored too.
    handlers["app:appUrlOpen"]({ url } as never);
    expect(deps.navigate).toHaveBeenCalledTimes(1);
  });

  it("does not re-open a stale launch link after a web-view reload, but follows a new link", async () => {
    const url = "https://app.goinmotus.com/programs/7";
    const shared = memoryLastHandled();
    const first = makeDeps(shared);
    vi.mocked(first.deps.app.getLaunchUrl).mockResolvedValue({ url });
    await registerNativeLifecycle(first.deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(first.deps.navigate).toHaveBeenCalledTimes(1);

    // Simulated reload: a fresh registration, same launch URL, store survives.
    const second = makeDeps(shared);
    vi.mocked(second.deps.app.getLaunchUrl).mockResolvedValue({ url });
    await registerNativeLifecycle(second.deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(second.deps.navigate).not.toHaveBeenCalled();

    second.handlers["app:appUrlOpen"]({ url: "inmotus://clients/42" } as never);
    expect(second.deps.navigate).toHaveBeenCalledWith("/clients/42");
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

  function anchorEvent(attrs: Record<string, string>) {
    return {
      preventDefault: vi.fn(),
      defaultPrevented: false,
      target: { closest: () => ({ getAttribute: (name: string) => attrs[name] ?? null }) },
    };
  }

  it("opens external links in the system browser and leaves internal ones alone", async () => {
    const { deps, click } = makeDeps();
    await registerNativeLifecycle(deps);
    const external = anchorEvent({ href: "https://youtube.com/x" });
    click(external);
    expect(external.preventDefault).toHaveBeenCalled();
    expect(deps.browser.open).toHaveBeenCalledWith({ url: "https://youtube.com/x" });
    const internal = anchorEvent({ href: "/clients" });
    click(internal);
    expect(internal.preventDefault).not.toHaveBeenCalled();
  });

  it("sends a same-origin target=_blank link to the system browser", async () => {
    const { deps, click } = makeDeps();
    await registerNativeLifecycle(deps);
    const blankSameOrigin = anchorEvent({ href: "/public/program-brief", target: "_blank" });
    click(blankSameOrigin);
    expect(blankSameOrigin.preventDefault).toHaveBeenCalled();
    expect(deps.browser.open).toHaveBeenCalledWith({ url: "https://app.goinmotus.com/public/program-brief" });
  });

  it("leaves a same-origin link without target alone", async () => {
    const { deps, click } = makeDeps();
    await registerNativeLifecycle(deps);
    const noTarget = anchorEvent({ href: "/clients" });
    click(noTarget);
    expect(noTarget.preventDefault).not.toHaveBeenCalled();
    expect(deps.browser.open).not.toHaveBeenCalled();
  });

  it("removes every listener on cleanup", async () => {
    const { deps, removed } = makeDeps();
    const cleanup = await registerNativeLifecycle(deps);
    cleanup();
    await Promise.resolve();
    expect(removed.sort()).toEqual([
      "app:appStateChange",
      "app:appUrlOpen",
      "app:backButton",
      "network:networkStatusChange",
    ]);
    expect(deps.doc.removeEventListener).toHaveBeenCalled();
  });

  it("keeps working when a plugin call rejects", async () => {
    const { deps } = makeDeps();
    vi.mocked(deps.splash.hide).mockRejectedValue(new Error("no splash"));
    vi.mocked(deps.app.getInfo).mockRejectedValue(new Error("no info"));
    await expect(registerNativeLifecycle(deps)).resolves.toBeTypeOf("function");
  });
});

describe("createLastHandledStore", () => {
  it("round-trips through storage", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const store = createLastHandledStore(() => storage);
    store.set("inmotus://dashboard");
    expect(data.get(LAST_DEEP_LINK_KEY)).toBe("inmotus://dashboard");
    expect(createLastHandledStore(() => storage).get()).toBe("inmotus://dashboard");
  });

  it("falls back to memory when storage throws", () => {
    const store = createLastHandledStore(() => {
      throw new Error("SecurityError");
    });
    expect(() => store.set("inmotus://clients/1")).not.toThrow();
    expect(store.get()).toBe("inmotus://clients/1");
  });
});
