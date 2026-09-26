"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { resolveNativeInfo, WEB_INFO, type NativeInfo } from "@/lib/native/platform";
import { createHandledLinksStore, registerNativeLifecycle } from "@/lib/native/lifecycle";
import { checkForRequiredUpdate } from "@/lib/native/version";
import { canUsePush, createPushTokenUnregisterer, registerPush } from "@/lib/native/push";
import { registerPushDeviceAction } from "@/actions/push-actions";
import { UpdateRequiredScreen } from "@/components/layout/update-required-screen";

export interface NativeContextValue extends NativeInfo {
  /** Connectivity: @capacitor/network inside the native shell, browser online/offline events elsewhere. */
  isOnline: boolean;
}

export const NATIVE_OVERRIDE_KEY = "inmotus:native-override";

const NativeContext = createContext<NativeContextValue>({ ...WEB_INFO, isOnline: true });

const ALLOW_OVERRIDE =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_NATIVE_DEBUG === "1";

/** `?native=ios|android` sets a persistent override; `?native=off` clears it. */
function readOverride(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("native");
    if (fromQuery === "off") {
      window.localStorage.removeItem(NATIVE_OVERRIDE_KEY);
      return null;
    }
    if (fromQuery) {
      window.localStorage.setItem(NATIVE_OVERRIDE_KEY, fromQuery);
      return fromQuery;
    }
    return window.localStorage.getItem(NATIVE_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

function applyDocumentFlags(info: NativeInfo) {
  const html = document.documentElement;
  html.toggleAttribute("data-native", info.isNative);
  if (info.platform) html.setAttribute("data-platform", info.platform);
  else html.removeAttribute("data-platform");

  // iOS zooms the page when an input is focused unless maximum-scale is set.
  // Only do this inside the shell so desktop and mobile web keep pinch-zoom.
  if (info.isNative) {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const content = meta?.getAttribute("content") ?? "";
    if (meta && !content.includes("maximum-scale")) {
      meta.setAttribute("content", `${content}, maximum-scale=1`);
    }
  }
}

export function NativeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Server render and first client render are always "web" so hydration matches.
  const [info, setInfo] = useState<NativeInfo>(WEB_INFO);
  const [isOnline, setIsOnline] = useState(true);
  const [updateRequired, setUpdateRequired] = useState<{ storeUrl: string | null } | null>(null);
  const [resumeTick, setResumeTick] = useState(0);
  const { isLoaded, isSignedIn, userId } = useAuth();
  // Read at token time: appVersion arrives asynchronously from App.getInfo().
  const infoRef = useRef(info);
  useEffect(() => {
    infoRef.current = info;
  }, [info]);
  // One per provider, so concurrent sign-out triggers share one request.
  const [unregisterPushToken] = useState(() =>
    createPushTokenUnregisterer({
      storage: () => window.localStorage,
      // keepalive: sign-out is often followed by a full-page navigation.
      post: (token) =>
        fetch("/api/push/unregister", {
          method: "POST",
          body: JSON.stringify({ token }),
          headers: { "content-type": "application/json" },
          keepalive: true,
        }),
    })
  );

  useEffect(() => {
    const resolved = resolveNativeInfo({
      capacitorPlatform: Capacitor.getPlatform(),
      override: readOverride(),
      allowOverride: ALLOW_OVERRIDE,
      userAgent: navigator.userAgent,
    });
    setInfo(resolved);
    applyDocumentFlags(resolved);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    // Only the real shell: the ?native= dev override fakes detection in a
    // desktop browser, where calling native plugins would be meaningless.
    if (!Capacitor.isNativePlatform()) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const [{ App }, { Network }, { SplashScreen }, { StatusBar, Style }, { Browser }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/network"),
        import("@capacitor/splash-screen"),
        import("@capacitor/status-bar"),
        import("@capacitor/browser"),
      ]);
      const dispose = await registerNativeLifecycle({
        app: App,
        network: Network,
        splash: SplashScreen,
        statusBar: { setStyle: () => StatusBar.setStyle({ style: Style.Light }) },
        browser: Browser,
        doc: {
          addEventListener: (type, fn, capture) =>
            document.addEventListener(type, fn as EventListener, capture),
          removeEventListener: (type, fn, capture) =>
            document.removeEventListener(type, fn as EventListener, capture),
        },
        origin: window.location.origin,
        now: () => Date.now(),
        historyBack: () => window.history.back(),
        navigate: (path) => router.push(path),
        handledLinks: createHandledLinksStore(() => window.sessionStorage),
        onOnlineChange: setIsOnline,
        onAppVersion: (appVersion) => setInfo((prev) => ({ ...prev, appVersion })),
        onResumeAfterLongPause: () => router.refresh(),
        onResume: () => setResumeTick((tick) => tick + 1),
      });
      if (cancelled) dispose();
      else cleanup = dispose;
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  useEffect(() => {
    // Push registration: real shell only, once per signed-in session per
    // mount. The effect re-runs only when the signed-in user changes; a
    // different user on the same device re-registers the token, which the
    // server reassigns to them. Builds without push (an Android build with no
    // google-services.json crashes natively on register) never get here.
    if (!Capacitor.isNativePlatform() || !isSignedIn || !userId) return;
    const native = resolveNativeInfo({
      capacitorPlatform: Capacitor.getPlatform(),
      allowOverride: false,
      userAgent: navigator.userAgent,
    });
    const platform = native.platform;
    if (!canUsePush(native) || !platform) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    let lastSentToken: string | null = null;
    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      // Strict mode's throwaway first run is cancelled before the import
      // resolves, so it never registers.
      if (cancelled) return;
      const dispose = await registerPush({
        plugin: PushNotifications,
        platform,
        // Deferred so a throwing localStorage accessor is caught inside registerPush.
        // Both callbacks are no-ops once this run is cancelled (signed out or
        // a different user), so a late token is never stored or sent for it.
        storage: {
          setItem: (key, value) => {
            if (!cancelled) window.localStorage.setItem(key, value);
          },
        },
        onToken: (token) => {
          if (cancelled || token === lastSentToken) return;
          registerPushDeviceAction({ token, platform, appVersion: infoRef.current.appVersion })
            .then((result) => {
              // Only a confirmed registration suppresses a resend of the same token.
              if (result.success) lastSentToken = token;
            })
            .catch(() => undefined);
        },
        onForeground: ({ title, body, path }) => {
          toast(title ?? "New notification", {
            description: body,
            action: path ? { label: "View", onClick: () => router.push(path) } : undefined,
          });
        },
        navigate: (path) => router.push(path),
      });
      if (cancelled) dispose();
      else cleanup = dispose;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isSignedIn, userId, router]);

  useEffect(() => {
    // Signed out on this device — just now, or a session that expired while
    // the app was closed: forget its stored token so the next user of the
    // device doesn't receive the previous user's pushes. The token is removed
    // locally only after the server confirms, so a failure retries next load.
    if (!isLoaded || isSignedIn || !Capacitor.isNativePlatform()) return;
    void unregisterPushToken();
  }, [isLoaded, isSignedIn, unregisterPushToken]);

  useEffect(() => {
    // Only the real shell: the ?native= dev override sets appVersion to
    // "0.0.0-debug", which isVersionBelow treats as malformed and never
    // blocks, but there is no reason to call the remote endpoint from a
    // desktop browser at all.
    if (!Capacitor.isNativePlatform()) return;
    if (!info.platform || !info.appVersion) return;
    let cancelled = false;
    checkForRequiredUpdate({
      platform: info.platform,
      appVersion: info.appVersion,
      fetchConfig: () => fetch("/api/mobile/config").then((r) => r.json()),
    }).then((result) => {
      if (!cancelled) setUpdateRequired(result);
    });
    return () => {
      cancelled = true;
    };
  }, [info.isNative, info.platform, info.appVersion, resumeTick]);

  const blocked = Boolean(updateRequired && info.platform);

  return (
    <NativeContext.Provider value={{ ...info, isOnline }}>
      {/* Always rendered so toggling `blocked` never remounts (and loses the
          state of) the app underneath; `display: contents` keeps layout
          unchanged, and `inert` removes the whole subtree from focus, tab
          order and assistive-tech traversal while UpdateRequiredScreen blocks. */}
      <div className="contents" inert={blocked ? true : undefined} aria-hidden={blocked ? true : undefined}>
        {children}
      </div>
      {updateRequired && info.platform && (
        <UpdateRequiredScreen
          platform={info.platform}
          storeUrl={updateRequired.storeUrl}
          onOpenStore={(url) => import("@capacitor/browser").then(({ Browser }) => Browser.open({ url }))}
        />
      )}
    </NativeContext.Provider>
  );
}

export function useNative(): NativeContextValue {
  return useContext(NativeContext);
}
