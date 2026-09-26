"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { resolveNativeInfo, WEB_INFO, type NativeInfo } from "@/lib/native/platform";
import { registerNativeLifecycle } from "@/lib/native/lifecycle";

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

  useEffect(() => {
    const resolved = resolveNativeInfo({
      capacitorPlatform: Capacitor.getPlatform(),
      override: readOverride(),
      allowOverride: ALLOW_OVERRIDE,
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
        onOnlineChange: setIsOnline,
        onAppVersion: (appVersion) => setInfo((prev) => ({ ...prev, appVersion })),
        onResumeAfterLongPause: () => router.refresh(),
      });
      if (cancelled) dispose();
      else cleanup = dispose;
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  return <NativeContext.Provider value={{ ...info, isOnline }}>{children}</NativeContext.Provider>;
}

export function useNative(): NativeContextValue {
  return useContext(NativeContext);
}
