"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { resolveNativeInfo, WEB_INFO, type NativeInfo } from "@/lib/native/platform";

export interface NativeContextValue extends NativeInfo {
  /** Browser connectivity. Plan 2 replaces the source with @capacitor/network on native. */
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
  // Server render and first client render are always "web" so hydration matches.
  const [info, setInfo] = useState<NativeInfo>(WEB_INFO);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const resolved = resolveNativeInfo({
      capacitorPlatform: Capacitor.getPlatform(),
      override: readOverride(),
      allowOverride: ALLOW_OVERRIDE,
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolving the native shell (Capacitor platform, query/localStorage override) requires browser APIs unavailable during SSR; this runs once on mount to sync from that external system.
    setInfo(resolved);
    applyDocumentFlags(resolved);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator.onLine is only readable client-side; this seeds state from that external system before subscribing to online/offline events below.
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

  return <NativeContext.Provider value={{ ...info, isOnline }}>{children}</NativeContext.Provider>;
}

export function useNative(): NativeContextValue {
  return useContext(NativeContext);
}
