/**
 * Native push notifications, client side. Pure decisions plus two functions
 * whose Capacitor plugin is injected (like lifecycle.ts), so they are
 * testable without a device. NativeProvider and PushPrompt pass the real
 * @capacitor/push-notifications plugin; tests pass fakes.
 */

import { APP_HOST, pathFromAppUrl } from "./deep-links";

/** localStorage key for this device's push token, read back on sign-out. */
export const PUSH_TOKEN_KEY = "inmotus:push-token";

type PermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

interface ListenerHandle {
  remove(): Promise<void>;
}

interface NotificationLike {
  title?: string;
  body?: string;
  data?: unknown;
}

export interface PushDeps {
  /** The subset of @capacitor/push-notifications this module uses. */
  plugin: {
    addListener(event: "registration", fn: (token: { value: string }) => void): Promise<ListenerHandle>;
    addListener(event: "registrationError", fn: (error: { error: string }) => void): Promise<ListenerHandle>;
    addListener(event: "pushNotificationReceived", fn: (n: NotificationLike) => void): Promise<ListenerHandle>;
    addListener(
      event: "pushNotificationActionPerformed",
      fn: (action: { actionId: string; notification: NotificationLike }) => void
    ): Promise<ListenerHandle>;
    checkPermissions(): Promise<{ receive: PermissionState }>;
    requestPermissions(): Promise<{ receive: PermissionState }>;
    register(): Promise<void>;
    createChannel(channel: { id: string; name: string; importance: 5 }): Promise<void>;
  };
  platform: "ios" | "android";
  storage: Pick<Storage, "setItem">;
  /** A (re)issued device token, to be sent to the server. */
  onToken(token: string): void;
  /** A notification that arrived while the app was open (no system banner is shown). */
  onForeground(notification: { title?: string; body?: string; path: string | null }): void;
  /** Client-side navigation to an in-app path. */
  navigate(path: string): void;
}

const ignore = () => undefined;
const APP_ORIGIN = `https://${APP_HOST}`;

/**
 * A notification's `link` as a safe in-app path, or null. Links are usually
 * relative ("/messages"), so they are resolved against the app origin first
 * and then passed through pathFromAppUrl, the fuzzed gate.
 */
export function linkToPath(link: string | undefined | null): string | null {
  if (!link) return null;
  try {
    return pathFromAppUrl(new URL(link, APP_ORIGIN).toString());
  } catch {
    return null;
  }
}

export function shouldShowPushPrompt(args: {
  isNative: boolean;
  permission: PermissionState | null;
  dismissed: boolean;
  visits: number;
}): boolean {
  return (
    args.isNative &&
    (args.permission === "prompt" || args.permission === "prompt-with-rationale") &&
    !args.dismissed &&
    args.visits >= 2
  );
}

function linkFromData(data: unknown): string | null {
  if (data && typeof data === "object" && "link" in data) {
    const link = (data as { link?: unknown }).link;
    return typeof link === "string" ? link : null;
  }
  return null;
}

/** Android needs a high-importance channel for heads-up banners; iOS has none. */
async function createChannelAndRegister(deps: Pick<PushDeps, "plugin" | "platform">): Promise<void> {
  if (deps.platform === "android") {
    await deps.plugin.createChannel({ id: "default", name: "Notifications", importance: 5 }).catch(ignore);
  }
  await deps.plugin.register().catch(ignore);
}

/**
 * Attaches the push listeners, then registers with APNs/FCM if permission was
 * already granted (it never asks — PushPrompt does). Never rejects; resolves
 * to a cleanup that removes every listener.
 */
export async function registerPush(deps: PushDeps): Promise<() => void> {
  const listeners = [
    deps.plugin.addListener("registration", ({ value }) => {
      try {
        deps.storage.setItem(PUSH_TOKEN_KEY, value);
      } catch {
        // Storage unavailable: the server still gets the token.
      }
      deps.onToken(value);
    }),
    // Nothing to do for the user; registration is retried on the next launch.
    deps.plugin.addListener("registrationError", ignore),
    deps.plugin.addListener("pushNotificationReceived", (n) => {
      deps.onForeground({ title: n.title, body: n.body, path: linkToPath(linkFromData(n.data)) });
    }),
    deps.plugin.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const link = linkFromData(notification?.data);
      if (!link) {
        deps.navigate("/dashboard");
        return;
      }
      // A link that fails the gate is ignored rather than rerouted.
      const path = linkToPath(link);
      if (path) deps.navigate(path);
    }),
  ];
  const settled = await Promise.allSettled(listeners);
  const handles = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  try {
    const { receive } = await deps.plugin.checkPermissions();
    if (receive === "granted") await createChannelAndRegister(deps);
  } catch {
    // No permission state: stay unregistered.
  }

  return () => {
    for (const h of handles) h.remove().catch(ignore);
  };
}

/**
 * Shows the OS permission dialog and registers on "granted". The token then
 * arrives through the registration listener registerPush attached.
 */
export async function requestPushPermission(
  deps: Pick<PushDeps, "plugin" | "platform">
): Promise<"granted" | "denied" | "prompt"> {
  let receive: PermissionState;
  try {
    ({ receive } = await deps.plugin.requestPermissions());
  } catch {
    return "prompt";
  }
  if (receive === "granted") {
    await createChannelAndRegister(deps);
    return "granted";
  }
  return receive === "denied" ? "denied" : "prompt";
}
