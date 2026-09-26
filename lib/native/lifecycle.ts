/**
 * Native shell lifecycle (spec §5, §9). Pure decisions plus one registration
 * function whose Capacitor plugins are injected, so it is testable without a
 * device. NativeProvider passes the real plugins; tests pass fakes.
 */

import { pathFromAppUrl } from "./deep-links";

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

/**
 * The deep-link URLs this app session has already navigated to. Consulted
 * only for getLaunchUrl(), which keeps returning a stale URL after every
 * web-view reload: iOS never clears its last opened URL (and updates it on
 * every warm open), Android keeps the launch intent for the activity's life.
 */
export interface HandledLinksStore {
  has(url: string): boolean;
  add(url: string): void;
}

export const HANDLED_DEEP_LINKS_KEY = "inmotus:handled-deep-links";
const HANDLED_LINKS_MAX = 20;

let handledLinksFallback: string[] = [];

/**
 * sessionStorage-backed store: it survives a full web-view reload (offline
 * retry, sign-out reload, hard navigation) within one app session, which is
 * as long as the platforms keep returning a launch URL. Falls back to a
 * module variable when storage is unavailable or throws.
 */
export function createHandledLinksStore(getStorage: () => Pick<Storage, "getItem" | "setItem">): HandledLinksStore {
  const read = (): string[] => {
    try {
      const raw = getStorage().getItem(HANDLED_DEEP_LINKS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === "string");
    } catch {
      // Fall through to the in-memory copy.
    }
    return handledLinksFallback;
  };
  return {
    has(url) {
      return read().includes(url);
    },
    add(url) {
      const next = [...read().filter((u) => u !== url), url].slice(-HANDLED_LINKS_MAX);
      handledLinksFallback = next;
      try {
        getStorage().setItem(HANDLED_DEEP_LINKS_KEY, JSON.stringify(next));
      } catch {
        // Fallback already recorded.
      }
    },
  };
}

/**
 * How long after one source delivers a cold-start link the other source's
 * copy of the same URL is still treated as the duplicate.
 */
export const COLD_START_PAIR_WINDOW_MS = 3000;

interface ListenerHandle {
  remove(): Promise<void>;
}

export interface LifecycleDeps {
  app: {
    addListener(event: "backButton", fn: (e: { canGoBack: boolean }) => void): Promise<ListenerHandle>;
    addListener(event: "appStateChange", fn: (e: { isActive: boolean }) => void): Promise<ListenerHandle>;
    addListener(event: "appUrlOpen", fn: (e: { url: string }) => void): Promise<ListenerHandle>;
    minimizeApp(): Promise<void>;
    getInfo(): Promise<{ version: string }>;
    getLaunchUrl(): Promise<{ url: string } | undefined>;
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
  /** Client-side navigation to an in-app path (a universal/app/scheme link). */
  navigate(path: string): void;
  /** Launch URLs already acted on this app session (see createHandledLinksStore). */
  handledLinks: HandledLinksStore;
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

  // Deep links arrive two ways: appUrlOpen (a link opened while running; on
  // iOS a cold-start link is also retained and delivered here once the
  // listener registers) and getLaunchUrl() (the link that launched the app).
  //
  // - A warm appUrlOpen always navigates, even to a URL handled before: the
  //   user tapped the link again.
  // - getLaunchUrl() skips URLs this session already navigated to, because it
  //   keeps returning a stale URL after every web-view reload.
  // - Cold-start pairing (this registration only, not persisted): whichever
  //   source first delivers URL U navigates; the other source's copy of U,
  //   if it arrives within COLD_START_PAIR_WINDOW_MS, is swallowed once.
  let pairPending: { url: string; from: "event" | "launch"; at: number } | null = null;
  let launchSettled = false;
  const takePair = (url: string, from: "event" | "launch") => {
    const p = pairPending;
    if (!p || p.from === from || p.url !== url || deps.now() - p.at > COLD_START_PAIR_WINDOW_MS) return false;
    pairPending = null;
    return true;
  };
  const onAppUrlOpen = (url: string) => {
    const path = pathFromAppUrl(url);
    if (!path) return;
    if (takePair(url, "event")) return;
    deps.handledLinks.add(url);
    if (!launchSettled) pairPending = { url, from: "event", at: deps.now() };
    deps.navigate(path);
  };
  const onLaunchUrl = (url: string) => {
    const path = pathFromAppUrl(url);
    // "/" is where the web view already is.
    if (!path || path === "/") return;
    if (takePair(url, "launch")) return;
    if (deps.handledLinks.has(url)) return;
    deps.handledLinks.add(url);
    pairPending = { url, from: "launch", at: deps.now() };
    deps.navigate(path);
  };

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
          if (status.connected) {
            // This refresh also services any debt left by an earlier offline
            // resume; clear it so the next connectivity event doesn't refresh
            // a second time.
            refreshOwed = false;
            deps.onResumeAfterLongPause();
          } else {
            refreshOwed = true;
          }
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
    // A universal link, app link or inmotus:// link opened while the app is
    // running. Only same-app paths are followed (pathFromAppUrl rejects other
    // hosts and protocol-relative paths).
    deps.app.addListener("appUrlOpen", ({ url }) => onAppUrlOpen(url)),
  ]);

  // Cold start from a link: the web view loaded the server root, so route to
  // the link's path.
  deps.app
    .getLaunchUrl()
    .then((launch) => {
      launchSettled = true;
      if (launch) onLaunchUrl(launch.url);
    })
    .catch(() => {
      launchSettled = true;
    });

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
