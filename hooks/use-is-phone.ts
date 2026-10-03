import { useSyncExternalStore } from "react";

// Touch-first device without hover (phones and tablets, including the native shell)…
const TOUCH_QUERY = "(pointer: coarse) and (hover: none)";
// …whose shorter screen side is phone-sized, so tablets are excluded in either orientation.
const PHONE_MAX_SHORT_SIDE = 600;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(TOUCH_QUERY);
  media.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getSnapshot() {
  return (
    window.matchMedia(TOUCH_QUERY).matches &&
    Math.min(window.screen.width, window.screen.height) < PHONE_MAX_SHORT_SIDE
  );
}

/** True on phones (mobile web and the native app). Always false during SSR. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
