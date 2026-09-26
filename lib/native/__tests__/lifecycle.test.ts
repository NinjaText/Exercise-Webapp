import { describe, it, expect, vi } from "vitest";
import {
  RESUME_REFRESH_AFTER_MS,
  COLD_START_PAIR_WINDOW_MS,
  HANDLED_DEEP_LINKS_KEY,
  createHandledLinksStore,
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

function memoryHandledLinks(initial: string[] = []) {
  const seen = new Set(initial);
  return { has: vi.fn((url: string) => seen.has(url)), add: vi.fn((url: string) => void seen.add(url)) };
}

function makeDeps(handledLinks = memoryHandledLinks()) {
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
    handledLinks,
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

  const U = "https://app.goinmotus.com/messages/abc";
  const flush = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };
  /** A getLaunchUrl whose resolution the test controls. */
  function deferredLaunch(deps: LifecycleDeps) {
    let resolve!: (v: { url: string } | undefined) => void;
    vi.mocked(deps.app.getLaunchUrl).mockReturnValue(new Promise((r) => (resolve = r)));
    return (v: { url: string } | undefined) => resolve(v);
  }

  it("cold start: retained appUrlOpen before getLaunchUrl resolves navigates once", async () => {
    const { deps, handlers } = makeDeps();
    const resolveLaunch = deferredLaunch(deps);
    await registerNativeLifecycle(deps);
    handlers["app:appUrlOpen"]({ url: U } as never);
    resolveLaunch({ url: U });
    await flush();
    expect(deps.navigate).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith("/messages/abc");
  });

  it("cold start: getLaunchUrl before the retained appUrlOpen navigates once", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.app.getLaunchUrl).mockResolvedValue({ url: U });
    await registerNativeLifecycle(deps);
    await flush();
    handlers["app:appUrlOpen"]({ url: U } as never);
    expect(deps.navigate).toHaveBeenCalledTimes(1);
  });

  it("reload: a stale launch URL already handled this session does not navigate", async () => {
    const { deps } = makeDeps(memoryHandledLinks([U]));
    vi.mocked(deps.app.getLaunchUrl).mockResolvedValue({ url: U });
    await registerNativeLifecycle(deps);
    await flush();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it("reload after a cold start: the persisted store suppresses the launch URL", async () => {
    const shared = memoryHandledLinks();
    const first = makeDeps(shared);
    const resolveLaunch = deferredLaunch(first.deps);
    await registerNativeLifecycle(first.deps);
    // Event-first cold start: only appUrlOpen navigated, yet it must still count.
    first.handlers["app:appUrlOpen"]({ url: U } as never);
    resolveLaunch({ url: U });
    await flush();
    const second = makeDeps(shared);
    vi.mocked(second.deps.app.getLaunchUrl).mockResolvedValue({ url: U });
    await registerNativeLifecycle(second.deps);
    await flush();
    expect(second.deps.navigate).not.toHaveBeenCalled();
  });

  it("after the cold-start pair, tapping the same link again navigates again", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.app.getLaunchUrl).mockResolvedValue({ url: U });
    await registerNativeLifecycle(deps);
    await flush();
    handlers["app:appUrlOpen"]({ url: U } as never); // the retained duplicate
    handlers["app:appUrlOpen"]({ url: U } as never); // a real second tap
    expect(deps.navigate).toHaveBeenCalledTimes(2);
  });

  it("a warm appUrlOpen always navigates, even to a URL handled before", async () => {
    const { deps, handlers } = makeDeps(memoryHandledLinks([U]));
    await registerNativeLifecycle(deps);
    await flush();
    handlers["app:appUrlOpen"]({ url: U } as never);
    handlers["app:appUrlOpen"]({ url: U } as never);
    expect(deps.navigate).toHaveBeenCalledTimes(2);
  });

  it("a different URL navigates", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.app.getLaunchUrl).mockResolvedValue({ url: U });
    await registerNativeLifecycle(deps);
    await flush();
    handlers["app:appUrlOpen"]({ url: "inmotus://clients/42" } as never);
    expect(deps.navigate).toHaveBeenCalledTimes(2);
    expect(deps.navigate).toHaveBeenLastCalledWith("/clients/42");
  });

  it("the launch-side pairing expires, so a later same-URL tap still navigates when no retained event came", async () => {
    const { deps, handlers } = makeDeps();
    vi.mocked(deps.app.getLaunchUrl).mockResolvedValue({ url: U });
    await registerNativeLifecycle(deps);
    await flush();
    vi.mocked(deps.now).mockReturnValue(COLD_START_PAIR_WINDOW_MS + 1);
    handlers["app:appUrlOpen"]({ url: U } as never);
    expect(deps.navigate).toHaveBeenCalledTimes(2);
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

describe("createHandledLinksStore", () => {
  it("round-trips through storage across store instances", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    createHandledLinksStore(() => storage).add("inmotus://dashboard");
    expect(JSON.parse(data.get(HANDLED_DEEP_LINKS_KEY) ?? "[]")).toEqual(["inmotus://dashboard"]);
    const again = createHandledLinksStore(() => storage);
    expect(again.has("inmotus://dashboard")).toBe(true);
    expect(again.has("inmotus://never-added")).toBe(false);
  });

  it("falls back to memory when storage throws", () => {
    const store = createHandledLinksStore(() => {
      throw new Error("SecurityError");
    });
    expect(() => store.add("inmotus://clients/1")).not.toThrow();
    expect(store.has("inmotus://clients/1")).toBe(true);
  });

  it("ignores corrupt stored data", () => {
    const storage = { getItem: () => "{not json", setItem: () => undefined };
    expect(createHandledLinksStore(() => storage).has("x")).toBe(false);
  });
});
