/**
 * Native shell lifecycle (spec §5, §9). Pure decisions plus one registration
 * function whose Capacitor plugins are injected, so it is testable without a
 * device. NativeProvider passes the real plugins; tests pass fakes.
 */

export const RESUME_REFRESH_AFTER_MS = 5 * 60 * 1000;

export function shouldRefreshOnResume(
  hiddenAt: number | null,
  now: number,
  thresholdMs: number = RESUME_REFRESH_AFTER_MS
): boolean {
  return hiddenAt !== null && now - hiddenAt >= thresholdMs;
}

export type BackAction = "back" | "minimize";

export function decideBackAction(canGoBack: boolean): BackAction {
  return canGoBack ? "back" : "minimize";
}

/** True only for http(s) links to a different origin. */
export function shouldOpenExternally(href: string, currentOrigin: string): boolean {
  let url: URL;
  try {
    url = new URL(href, currentOrigin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.origin !== new URL(currentOrigin).origin;
}

interface ListenerHandle {
  remove(): Promise<void>;
}

export interface LifecycleDeps {
  app: {
    addListener(event: "backButton", fn: (e: { canGoBack: boolean }) => void): Promise<ListenerHandle>;
    addListener(event: "appStateChange", fn: (e: { isActive: boolean }) => void): Promise<ListenerHandle>;
    minimizeApp(): Promise<void>;
    getInfo(): Promise<{ version: string }>;
  };
  network: {
    addListener(event: "networkStatusChange", fn: (e: { connected: boolean }) => void): Promise<ListenerHandle>;
    getStatus(): Promise<{ connected: boolean }>;
  };
  splash: { hide(): Promise<void> };
  statusBar: { setStyle(options: { style: "LIGHT" }): Promise<void> };
  browser: { open(options: { url: string }): Promise<void> };
  doc: {
    addEventListener(type: "click", fn: (e: never) => void, capture: boolean): void;
    removeEventListener(type: "click", fn: (e: never) => void, capture: boolean): void;
  };
  origin: string;
  now(): number;
  historyBack(): void;
  onOnlineChange(online: boolean): void;
  onAppVersion(version: string): void;
  onResumeAfterLongPause(): void;
}

interface ClickLike {
  defaultPrevented: boolean;
  preventDefault(): void;
  target: { closest?(selector: string): { getAttribute(name: string): string | null } | null } | null;
}

const ignore = () => undefined;

export async function registerNativeLifecycle(deps: LifecycleDeps): Promise<() => void> {
  // Hand-off from the native splash as soon as the web app is interactive.
  deps.splash.hide().catch(ignore);
  deps.statusBar.setStyle({ style: "LIGHT" }).catch(ignore);
  deps.app.getInfo().then((info) => deps.onAppVersion(info.version)).catch(ignore);
  deps.network.getStatus().then((s) => deps.onOnlineChange(s.connected)).catch(ignore);

  let hiddenAt: number | null = null;
  // Set when a resume-triggered refresh was skipped because the device was
  // offline at the time; consumed by the next networkStatusChange that
  // reports connectivity, so data still refreshes without a destructive
  // navigation while offline (spec §5: never route through offline.html for
  // a resume the user didn't ask for).
  let refreshOwed = false;
  const handles = await Promise.all([
    deps.app.addListener("backButton", ({ canGoBack }) => {
      if (decideBackAction(canGoBack) === "back") deps.historyBack();
      else deps.app.minimizeApp().catch(ignore);
    }),
    deps.app.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        hiddenAt = deps.now();
        return;
      }
      const wasLongPause = shouldRefreshOnResume(hiddenAt, deps.now());
      hiddenAt = null;
      if (!wasLongPause) return;
      deps.network
        .getStatus()
        .then((status) => {
          if (status.connected) deps.onResumeAfterLongPause();
          else refreshOwed = true;
        })
        .catch(() => {
          // Can't tell — treat as offline rather than risk a destructive
          // navigation on a failed RSC fetch.
          refreshOwed = true;
        });
    }),
    deps.network.addListener("networkStatusChange", ({ connected }) => {
      deps.onOnlineChange(connected);
      if (connected && refreshOwed) {
        refreshOwed = false;
        deps.onResumeAfterLongPause();
      }
    }),
  ]);

  const onClick = (e: ClickLike) => {
    if (e.defaultPrevented) return;
    const anchor = e.target?.closest?.("a[href]");
    const href = anchor?.getAttribute("href");
    if (!href) return;
    if (shouldOpenExternally(href, deps.origin)) {
      e.preventDefault();
      deps.browser.open({ url: new URL(href, deps.origin).toString() }).catch(ignore);
      return;
    }
    // A native web view has no tabs: a same-origin target="_blank" link would
    // otherwise replace the app page (e.g. the public program-brief
    // template). Send it to the system browser instead. This suits public,
    // unauthenticated pages — an authenticated page opened this way would
    // lack the session the in-app view carries.
    if (anchor?.getAttribute("target") === "_blank") {
      e.preventDefault();
      deps.browser.open({ url: new URL(href, deps.origin).toString() }).catch(ignore);
    }
  };
  deps.doc.addEventListener("click", onClick as (e: never) => void, true);

  return () => {
    for (const h of handles) h.remove().catch(ignore);
    deps.doc.removeEventListener("click", onClick as (e: never) => void, true);
  };
}
