import { describe, it, expect, vi } from "vitest";
import {
  PUSH_TOKEN_KEY,
  canUsePush,
  createPushTokenUnregisterer,
  shouldRequestPushOnEnable,
  shouldShowPushDeniedHint,
  linkToPath,
  registerPush,
  requestPushPermission,
  shouldShowPushPrompt,
  type PushDeps,
} from "../push";

describe("linkToPath", () => {
  it("keeps a relative in-app link with its query", () => {
    expect(linkToPath("/messages/1?x=1")).toBe("/messages/1?x=1");
  });
  it("turns an absolute app URL into its path", () => {
    expect(linkToPath("https://app.goinmotus.com/clients/2")).toBe("/clients/2");
  });
  it("rejects foreign hosts, protocol-relative and backslash tricks, scripts and empties", () => {
    expect(linkToPath("https://evil.com/x")).toBeNull();
    expect(linkToPath("//evil.com")).toBeNull();
    expect(linkToPath("/\\evil.com")).toBeNull();
    expect(linkToPath("javascript:alert(1)")).toBeNull();
    expect(linkToPath("")).toBeNull();
    expect(linkToPath(null)).toBeNull();
    expect(linkToPath(undefined)).toBeNull();
  });
});

describe("canUsePush", () => {
  it("needs the real shell with the push token", () => {
    expect(canUsePush({ isNative: true, platform: "ios", push: true })).toBe(true);
    expect(canUsePush({ isNative: true, platform: "android", push: true })).toBe(true);
  });
  it("is false on web, without a platform, or when the build has no push token", () => {
    expect(canUsePush({ isNative: false })).toBe(false);
    expect(canUsePush({ isNative: true, push: true })).toBe(false);
    expect(canUsePush({ isNative: true, platform: "android", push: false })).toBe(false);
    expect(canUsePush({ isNative: true, platform: "android" })).toBe(false);
  });
});

describe("shouldShowPushPrompt", () => {
  const base = { isNative: true, pushAvailable: true, permission: "prompt" as const, dismissed: false, visits: 2 };
  it("shows on the second native visit while permission is undecided", () => {
    expect(shouldShowPushPrompt(base)).toBe(true);
    expect(shouldShowPushPrompt({ ...base, permission: "prompt-with-rationale" })).toBe(true);
    expect(shouldShowPushPrompt({ ...base, visits: 5 })).toBe(true);
  });
  it("does not show on web, on the first visit, once dismissed, or once decided", () => {
    expect(shouldShowPushPrompt({ ...base, isNative: false })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, pushAvailable: false })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, visits: 1 })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, dismissed: true })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: "granted" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: "denied" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: null })).toBe(false);
  });
});

describe("shouldRequestPushOnEnable", () => {
  const base = { checked: true, pushAvailable: true, permission: "prompt" as const };
  it("asks the OS when push is switched on while permission is undecided", () => {
    expect(shouldRequestPushOnEnable(base)).toBe(true);
    expect(shouldRequestPushOnEnable({ ...base, permission: "prompt-with-rationale" })).toBe(true);
  });
  it("does not ask when switching off, on web or push-less builds, or once decided", () => {
    expect(shouldRequestPushOnEnable({ ...base, checked: false })).toBe(false);
    expect(shouldRequestPushOnEnable({ ...base, pushAvailable: false })).toBe(false);
    expect(shouldRequestPushOnEnable({ ...base, permission: "granted" })).toBe(false);
    expect(shouldRequestPushOnEnable({ ...base, permission: "denied" })).toBe(false);
    expect(shouldRequestPushOnEnable({ ...base, permission: null })).toBe(false);
  });
});

describe("shouldShowPushDeniedHint", () => {
  const base = { pushEnabled: true, pushAvailable: true, permission: "denied" as const };
  it("shows while push is on in Settings but denied by the OS", () => {
    expect(shouldShowPushDeniedHint(base)).toBe(true);
  });
  it("hides when push is off, on web or push-less builds, or when not denied", () => {
    expect(shouldShowPushDeniedHint({ ...base, pushEnabled: false })).toBe(false);
    expect(shouldShowPushDeniedHint({ ...base, pushAvailable: false })).toBe(false);
    expect(shouldShowPushDeniedHint({ ...base, permission: "granted" })).toBe(false);
    expect(shouldShowPushDeniedHint({ ...base, permission: "prompt" })).toBe(false);
    expect(shouldShowPushDeniedHint({ ...base, permission: null })).toBe(false);
  });
});

describe("createPushTokenUnregisterer", () => {
  function setup(opts: { stored?: string | null; post?: () => Promise<{ ok: boolean; status?: number }> } = {}) {
    const store = new Map<string, string>();
    if (opts.stored !== null) store.set(PUSH_TOKEN_KEY, opts.stored ?? "tok-1");
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => void store.delete(k),
    };
    const post = vi.fn(opts.post ?? (() => Promise.resolve({ ok: true })));
    const unregister = createPushTokenUnregisterer({ storage: () => storage, post });
    return { store, post, unregister };
  }

  it("posts the stored token and forgets it after a 2xx", async () => {
    const { store, post, unregister } = setup();
    await unregister();
    expect(post).toHaveBeenCalledWith("tok-1");
    expect(store.has(PUSH_TOKEN_KEY)).toBe(false);
  });

  it("keeps the token for a retry when the server fails or the request rejects", async () => {
    const failed = setup({ post: () => Promise.resolve({ ok: false }) });
    await failed.unregister();
    expect(failed.store.get(PUSH_TOKEN_KEY)).toBe("tok-1");

    const offline = setup({ post: () => Promise.reject(new TypeError("Failed to fetch")) });
    await expect(offline.unregister()).resolves.toBeUndefined();
    expect(offline.store.get(PUSH_TOKEN_KEY)).toBe("tok-1");
  });

  it("forgets the token on a permanent 4xx but keeps it on 408/429/5xx", async () => {
    const bad = setup({ post: () => Promise.resolve({ ok: false, status: 400 }) });
    await bad.unregister();
    expect(bad.store.has(PUSH_TOKEN_KEY)).toBe(false);

    for (const status of [408, 429, 500, 503]) {
      const retry = setup({ post: () => Promise.resolve({ ok: false, status }) });
      await retry.unregister();
      expect(retry.store.get(PUSH_TOKEN_KEY)).toBe("tok-1");
    }
  });

  it("does nothing without a stored token or storage", async () => {
    const { post, unregister } = setup({ stored: null });
    await unregister();
    expect(post).not.toHaveBeenCalled();

    const noStorage = vi.fn();
    const throwing = createPushTokenUnregisterer({
      storage: () => {
        throw new Error("SecurityError");
      },
      post: noStorage,
    });
    await expect(throwing()).resolves.toBeUndefined();
    expect(noStorage).not.toHaveBeenCalled();
  });

  it("shares one request between concurrent calls, and allows a later retry", async () => {
    let respond: (r: { ok: boolean }) => void = () => {};
    const { post, unregister } = setup({ post: () => new Promise((resolve) => (respond = resolve)) });
    const first = unregister();
    const second = unregister();
    expect(second).toBe(first);
    respond({ ok: false });
    await first;
    expect(post).toHaveBeenCalledTimes(1);

    const retry = unregister();
    expect(retry).not.toBe(first);
    respond({ ok: true });
    await retry;
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("does not remove a different token stored while the request was in flight", async () => {
    let respond: (r: { ok: boolean }) => void = () => {};
    const { store, unregister } = setup({ post: () => new Promise((resolve) => (respond = resolve)) });
    const done = unregister();
    store.set(PUSH_TOKEN_KEY, "tok-2");
    respond({ ok: true });
    await done;
    expect(store.get(PUSH_TOKEN_KEY)).toBe("tok-2");
  });
});

type Permission = "granted" | "denied" | "prompt" | "prompt-with-rationale";

function makeDeps(opts: { permission?: Permission; platform?: "ios" | "android" } = {}) {
  const handlers: Record<string, (arg: never) => void> = {};
  const calls: string[] = [];
  const removed: string[] = [];
  const stored = new Map<string, string>();
  const deps: PushDeps = {
    plugin: {
      addListener: ((event: string, fn: (arg: never) => void) => {
        calls.push(`addListener:${event}`);
        handlers[event] = fn;
        return Promise.resolve({
          remove: () => {
            removed.push(event);
            return Promise.resolve();
          },
        });
      }) as unknown as PushDeps["plugin"]["addListener"],
      checkPermissions: vi.fn(() => Promise.resolve({ receive: opts.permission ?? "granted" })),
      requestPermissions: vi.fn(() => Promise.resolve({ receive: "granted" as Permission })),
      register: vi.fn(() => {
        calls.push("register");
        return Promise.resolve();
      }),
      createChannel: vi.fn(() => Promise.resolve()),
    },
    platform: opts.platform ?? "android",
    storage: { setItem: (k: string, v: string) => void stored.set(k, v) },
    onToken: vi.fn(),
    onForeground: vi.fn(),
    navigate: vi.fn(),
  };
  return { deps, handlers, removed, stored, calls };
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe("registerPush", () => {
  it("creates the Android channel and registers when permission is already granted", async () => {
    const { deps } = makeDeps({ permission: "granted", platform: "android" });
    await registerPush(deps);
    expect(deps.plugin.createChannel).toHaveBeenCalledWith({ id: "default", name: "Notifications", importance: 5 });
    expect(deps.plugin.register).toHaveBeenCalledTimes(1);
  });

  it("attaches the registration listener before calling register", async () => {
    // A token issued before the listener exists would be lost.
    const { deps, calls } = makeDeps({ permission: "granted" });
    await registerPush(deps);
    expect(calls).toContain("register");
    expect(calls.indexOf("addListener:registration")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("addListener:registration")).toBeLessThan(calls.indexOf("register"));
  });

  it("does not create a channel on iOS but still registers", async () => {
    const { deps } = makeDeps({ permission: "granted", platform: "ios" });
    await registerPush(deps);
    expect(deps.plugin.createChannel).not.toHaveBeenCalled();
    expect(deps.plugin.register).toHaveBeenCalledTimes(1);
  });

  it("does not register while permission is undecided or denied", async () => {
    for (const permission of ["prompt", "prompt-with-rationale", "denied"] as const) {
      const { deps } = makeDeps({ permission });
      await registerPush(deps);
      expect(deps.plugin.register).not.toHaveBeenCalled();
    }
  });

  it("reports and stores the token from the registration event", async () => {
    const { deps, handlers, stored } = makeDeps();
    await registerPush(deps);
    handlers.registration({ value: "tok-123" } as never);
    expect(deps.onToken).toHaveBeenCalledWith("tok-123");
    expect(stored.get(PUSH_TOKEN_KEY)).toBe("tok-123");
  });

  it("still reports the token when storage throws", async () => {
    const { deps, handlers } = makeDeps();
    deps.storage = {
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    await registerPush(deps);
    expect(() => handlers.registration({ value: "tok-123" } as never)).not.toThrow();
    expect(deps.onToken).toHaveBeenCalledWith("tok-123");
  });

  it("hands a foreground notification to onForeground with a vetted path", async () => {
    const { deps, handlers } = makeDeps();
    await registerPush(deps);
    handlers.pushNotificationReceived({ title: "New message", body: "Hi", data: { link: "/messages/7" } } as never);
    expect(deps.onForeground).toHaveBeenLastCalledWith({ title: "New message", body: "Hi", path: "/messages/7" });
    handlers.pushNotificationReceived({ title: "X", body: "Y", data: { link: "https://evil.com/x" } } as never);
    expect(deps.onForeground).toHaveBeenLastCalledWith({ title: "X", body: "Y", path: null });
    handlers.pushNotificationReceived({ title: "Z" } as never);
    expect(deps.onForeground).toHaveBeenLastCalledWith({ title: "Z", body: undefined, path: null });
  });

  it("navigates on a tap with a safe link, not with a hostile one, and to the dashboard with none", async () => {
    const { deps, handlers } = makeDeps();
    await registerPush(deps);
    const tap = (data: unknown) =>
      handlers.pushNotificationActionPerformed({ actionId: "tap", notification: { data } } as never);

    tap({ link: "/check-ins/abc" });
    expect(deps.navigate).toHaveBeenLastCalledWith("/check-ins/abc");
    expect(deps.navigate).toHaveBeenCalledTimes(1);

    tap({ link: "//evil.com" });
    tap({ link: "javascript:alert(1)" });
    expect(deps.navigate).toHaveBeenCalledTimes(1);

    tap({});
    expect(deps.navigate).toHaveBeenLastCalledWith("/dashboard");
    tap(undefined);
    expect(deps.navigate).toHaveBeenCalledTimes(3);
    expect(deps.navigate).toHaveBeenLastCalledWith("/dashboard");
  });

  it("removes every listener on cleanup", async () => {
    const { deps, removed } = makeDeps();
    const cleanup = await registerPush(deps);
    cleanup();
    await flush();
    expect(removed.sort()).toEqual([
      "pushNotificationActionPerformed",
      "pushNotificationReceived",
      "registration",
      "registrationError",
    ]);
  });

  it("never rejects when a plugin call rejects", async () => {
    const { deps } = makeDeps();
    vi.mocked(deps.plugin.checkPermissions).mockRejectedValue(new Error("no plugin"));
    await expect(registerPush(deps)).resolves.toBeTypeOf("function");

    const second = makeDeps();
    vi.mocked(second.deps.plugin.createChannel).mockRejectedValue(new Error("no channel"));
    vi.mocked(second.deps.plugin.register).mockRejectedValue(new Error("no register"));
    await expect(registerPush(second.deps)).resolves.toBeTypeOf("function");
    // A failed channel creation must not stop registration.
    expect(second.deps.plugin.register).toHaveBeenCalled();

    const third = makeDeps();
    third.deps.plugin.addListener = (() =>
      Promise.reject(new Error("no listeners"))) as unknown as PushDeps["plugin"]["addListener"];
    await expect(registerPush(third.deps)).resolves.toBeTypeOf("function");
  });
});

describe("requestPushPermission", () => {
  it("registers when the user grants permission", async () => {
    const { deps } = makeDeps({ platform: "android" });
    vi.mocked(deps.plugin.requestPermissions).mockResolvedValue({ receive: "granted" });
    await expect(requestPushPermission(deps)).resolves.toBe("granted");
    expect(deps.plugin.createChannel).toHaveBeenCalledWith({ id: "default", name: "Notifications", importance: 5 });
    expect(deps.plugin.register).toHaveBeenCalledTimes(1);
  });

  it("does not register when the user denies", async () => {
    const { deps } = makeDeps();
    vi.mocked(deps.plugin.requestPermissions).mockResolvedValue({ receive: "denied" });
    await expect(requestPushPermission(deps)).resolves.toBe("denied");
    expect(deps.plugin.register).not.toHaveBeenCalled();
  });

  it("maps prompt-with-rationale to prompt and a rejected request to prompt", async () => {
    const { deps } = makeDeps();
    vi.mocked(deps.plugin.requestPermissions).mockResolvedValue({ receive: "prompt-with-rationale" });
    await expect(requestPushPermission(deps)).resolves.toBe("prompt");
    vi.mocked(deps.plugin.requestPermissions).mockRejectedValue(new Error("boom"));
    await expect(requestPushPermission(deps)).resolves.toBe("prompt");
    expect(deps.plugin.register).not.toHaveBeenCalled();
  });
});
