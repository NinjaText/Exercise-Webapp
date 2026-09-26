import { describe, it, expect, vi } from "vitest";
import {
  PUSH_TOKEN_KEY,
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

describe("shouldShowPushPrompt", () => {
  const base = { isNative: true, permission: "prompt" as const, dismissed: false, visits: 2 };
  it("shows on the second native visit while permission is undecided", () => {
    expect(shouldShowPushPrompt(base)).toBe(true);
    expect(shouldShowPushPrompt({ ...base, permission: "prompt-with-rationale" })).toBe(true);
    expect(shouldShowPushPrompt({ ...base, visits: 5 })).toBe(true);
  });
  it("does not show on web, on the first visit, once dismissed, or once decided", () => {
    expect(shouldShowPushPrompt({ ...base, isNative: false })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, visits: 1 })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, dismissed: true })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: "granted" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: "denied" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: null })).toBe(false);
  });
});

type Permission = "granted" | "denied" | "prompt" | "prompt-with-rationale";

function makeDeps(opts: { permission?: Permission; platform?: "ios" | "android" } = {}) {
  const handlers: Record<string, (arg: never) => void> = {};
  const removed: string[] = [];
  const stored = new Map<string, string>();
  const deps: PushDeps = {
    plugin: {
      addListener: ((event: string, fn: (arg: never) => void) => {
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
      register: vi.fn(() => Promise.resolve()),
      createChannel: vi.fn(() => Promise.resolve()),
    },
    platform: opts.platform ?? "android",
    storage: { setItem: (k: string, v: string) => void stored.set(k, v) },
    onToken: vi.fn(),
    onForeground: vi.fn(),
    navigate: vi.fn(),
  };
  return { deps, handlers, removed, stored };
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
